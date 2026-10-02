"""Cinemasters Movie Ladder API.

Google verifies identity. Admin authority is enforced server-side. TMDb credentials
are stored only in private server storage and are never returned to the browser.
"""
import json
import os
import re
import tempfile
import time
from functools import wraps
from pathlib import Path

import cachecontrol
import requests
from flask import Flask, abort, g, jsonify, request
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from werkzeug.exceptions import HTTPException

DEFAULT_GOOGLE_CLIENT_ID = "569822322277-ng39tk1vcecgjfes85bs16umb5k47mc7.apps.googleusercontent.com"
TMDB_API = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATA_DIR=os.environ.get("MOVIE_LADDER_DATA_DIR"),
        GOOGLE_CLIENT_ID=os.environ.get("MOVIE_LADDER_GOOGLE_CLIENT_ID", DEFAULT_GOOGLE_CLIENT_ID),
        ADMIN_EMAILS={
            value.strip().lower()
            for value in os.environ.get("MOVIE_LADDER_ADMIN_EMAILS", "").split(",")
            if value.strip()
        },
        ADMIN_SUBS={
            value.strip()
            for value in os.environ.get("MOVIE_LADDER_ADMIN_SUBS", "").split(",")
            if value.strip()
        },
        ALLOWED_ORIGINS={
            value.strip().rstrip("/")
            for value in os.environ.get(
                "MOVIE_LADDER_ALLOWED_ORIGINS",
                "https://ronavis.github.io,http://127.0.0.1:8000,http://localhost:8000",
            ).split(",")
            if value.strip()
        },
        TESTING=False,
    )
    if config:
        app.config.update(config)

    if not app.config["DATA_DIR"]:
        raise RuntimeError("MOVIE_LADDER_DATA_DIR must point to private persistent storage.")
    if not app.config["ADMIN_EMAILS"] and not app.config["ADMIN_SUBS"] and not app.config["TESTING"]:
        raise RuntimeError("Configure exactly the intended admin with MOVIE_LADDER_ADMIN_EMAILS or MOVIE_LADDER_ADMIN_SUBS.")

    data_dir = Path(app.config["DATA_DIR"]).resolve()
    data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    settings_path = data_dir / "settings.json"
    google_request = GoogleRequest(session=cachecontrol.CacheControl(requests.Session()))

    def read_settings():
        if not settings_path.exists():
            return {}
        try:
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raise RuntimeError("Private settings storage is unreadable.")
        return payload if isinstance(payload, dict) else {}

    def write_settings(payload):
        data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, temp_name = tempfile.mkstemp(prefix="settings-", suffix=".json", dir=data_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp_name, 0o600)
            os.replace(temp_name, settings_path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)

    def tmdb_token():
        return str(read_settings().get("tmdb_token", "")).strip()

    def tmdb_headers(token=None):
        token = (token or tmdb_token()).strip()
        if not token:
            abort(503, "TMDb is not configured yet.")
        return {"Authorization": f"Bearer {token}", "accept": "application/json"}

    def tmdb_request(path, *, params=None, token=None):
        try:
            response = requests.get(
                f"{TMDB_API}{path}",
                headers=tmdb_headers(token),
                params=params or {},
                timeout=10,
            )
        except requests.RequestException:
            abort(503, "TMDb is temporarily unavailable.")
        if response.status_code in {401, 403}:
            abort(502, "TMDb rejected the configured credential.")
        if response.status_code == 404:
            abort(404, "TMDb could not find that movie.")
        if not response.ok:
            abort(502, f"TMDb returned HTTP {response.status_code}.")
        try:
            return response.json()
        except ValueError:
            abort(502, "TMDb returned an unreadable response.")

    def image_url(path, size="w780"):
        if not path:
            return None
        if not re.fullmatch(r"/[A-Za-z0-9_.-]+", str(path)):
            return None
        return f"{TMDB_IMAGE_BASE}/{size}{path}"

    @app.before_request
    def origin_guard():
        origin = request.headers.get("Origin")
        if request.path.startswith("/api/") and origin and origin.rstrip("/") not in app.config["ALLOWED_ORIGINS"]:
            abort(403, "This website is not allowed to access Movie Ladder.")
        if request.method == "OPTIONS":
            return "", 204

    @app.after_request
    def response_headers(response):
        origin = request.headers.get("Origin")
        if origin and origin.rstrip("/") in app.config["ALLOWED_ORIGINS"]:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    def authenticated(admin=False):
        def decorate(fn):
            @wraps(fn)
            def wrapped(*args, **kwargs):
                auth = request.headers.get("Authorization", "")
                if not auth.startswith("Bearer ") or len(auth) > 8192:
                    abort(401, "Sign in with Google to continue.")
                try:
                    if app.config["TESTING"] and app.config.get("TEST_TOKEN_VERIFIER"):
                        who = app.config["TEST_TOKEN_VERIFIER"](auth[7:])
                    else:
                        who = id_token.verify_oauth2_token(
                            auth[7:], google_request, app.config["GOOGLE_CLIENT_ID"]
                        )
                    if not who.get("sub") or who.get("email_verified") is not True or not who.get("email"):
                        raise ValueError("Unverified identity")
                except (TransportError, requests.RequestException):
                    abort(503, "Google sign-in verification is temporarily unavailable.")
                except (ValueError, KeyError, GoogleAuthError):
                    abort(401, "Your Google sign-in expired or could not be verified.")

                email = who["email"].lower()
                sub = str(who["sub"])
                is_admin = sub in app.config["ADMIN_SUBS"] or email in app.config["ADMIN_EMAILS"]
                g.user = {"sub": sub, "email": email, "admin": is_admin}
                if admin and not is_admin:
                    abort(403, "Administrator access is required.")
                return fn(*args, **kwargs)
            return wrapped
        return decorate

    @app.get("/api/health")
    def health():
        return jsonify(ok=True, service="cinemasters-movie-ladder")

    @app.get("/api/config")
    def public_config():
        return jsonify(googleClientId=app.config["GOOGLE_CLIENT_ID"])

    @app.get("/api/session")
    @authenticated()
    def session():
        return jsonify(email=g.user["email"], admin=g.user["admin"])

    @app.get("/api/admin/tmdb")
    @authenticated(admin=True)
    def tmdb_status():
        settings = read_settings()
        configured = bool(str(settings.get("tmdb_token", "")).strip())
        return jsonify(
            configured=configured,
            lastVerifiedAt=settings.get("tmdb_verified_at"),
        )

    @app.put("/api/admin/tmdb")
    @authenticated(admin=True)
    def save_tmdb():
        body = request.get_json(silent=True) or {}
        token = str(body.get("token", "")).strip()
        if len(token) < 20 or len(token) > 4096 or any(ch.isspace() for ch in token):
            abort(400, "Enter a valid TMDb API Read Access Token.")

        tmdb_request("/configuration", token=token)
        payload = read_settings()
        payload["tmdb_token"] = token
        payload["tmdb_verified_at"] = int(time.time())
        payload.pop("tmdb_account", None)
        write_settings(payload)
        return jsonify(
            configured=True,
            lastVerifiedAt=payload["tmdb_verified_at"],
        )

    @app.delete("/api/admin/tmdb")
    @authenticated(admin=True)
    def delete_tmdb():
        payload = read_settings()
        payload.pop("tmdb_token", None)
        payload.pop("tmdb_verified_at", None)
        payload.pop("tmdb_account", None)
        write_settings(payload)
        return jsonify(configured=False)

    @app.post("/api/admin/tmdb/test")
    @authenticated(admin=True)
    def test_tmdb():
        tmdb_request("/configuration")
        payload = read_settings()
        payload["tmdb_verified_at"] = int(time.time())
        payload.pop("tmdb_account", None)
        write_settings(payload)
        return jsonify(ok=True, lastVerifiedAt=payload["tmdb_verified_at"])

    @app.get("/api/tmdb/movie/<int:movie_id>")
    def movie(movie_id):
        payload = tmdb_request(f"/movie/{movie_id}", params={"language": "en-US"})
        genres = [item.get("name") for item in payload.get("genres", []) if item.get("name")]
        return jsonify(
            id=payload.get("id"),
            title=payload.get("title"),
            releaseDate=payload.get("release_date"),
            genres=genres,
            poster=image_url(payload.get("poster_path"), "w500"),
            backdrop=image_url(payload.get("backdrop_path"), "w780"),
        )

    @app.get("/api/tmdb/search")
    def search_movie():
        title = str(request.args.get("title", "")).strip()
        year = str(request.args.get("year", "")).strip()
        if not title or len(title) > 160:
            abort(400, "Movie title is required.")
        params = {"query": title, "include_adult": "false", "language": "en-US"}
        if re.fullmatch(r"\d{4}", year):
            params["year"] = year
        payload = tmdb_request("/search/movie", params=params)
        results = payload.get("results") or []
        if not results:
            abort(404, "TMDb could not find that movie.")
        item = results[0]
        return jsonify(
            id=item.get("id"),
            title=item.get("title"),
            releaseDate=item.get("release_date"),
            poster=image_url(item.get("poster_path"), "w500"),
            backdrop=image_url(item.get("backdrop_path"), "w780"),
        )

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=int(os.environ.get("PORT", "8092")))
