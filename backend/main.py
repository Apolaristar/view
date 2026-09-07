from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from api.boards import router as boards_router
from api.images import router as images_router
from api.meta import router as meta_router
from api.search import router as search_router
from api.tags import router as tags_router
from core.database import connect, init_db
from core.paths import ensure_data_dirs, originals_dir, thumbnails_dir, board_previews_dir
from core.queue import start_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_data_dirs()
    init_db()
    start_worker()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="PoseBoard", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    def _safe_media(folder: Path, path: Path, media_type: str | None = None) -> FileResponse:
        resolved = path.resolve()
        root = folder.resolve()
        if root not in resolved.parents and resolved != root:
            raise HTTPException(status_code=404, detail="文件不存在")
        suffix = resolved.suffix.lower()
        guessed = {
            ".webp": "image/webp",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
        }.get(suffix, media_type)
        return FileResponse(
            resolved,
            media_type=guessed,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=86400",
            },
        )

    def _media_file(kind: str, uid: str) -> FileResponse:
        token = Path(uid).name.split(".")[0]
        folder = originals_dir() if kind == "originals" else thumbnails_dir()
        candidates: list[Path] = []
        if kind == "thumbnails":
            candidates.extend(folder / f"{token}{ext}" for ext in (".webp", ".jpg", ".jpeg", ".png"))
        else:
            candidates.extend(sorted(folder.glob(f"{token}.*")))
        for path in candidates:
            if path.is_file():
                return _safe_media(folder, path)
        conn = connect()
        try:
            row = conn.execute(
                "SELECT original_path, thumbnail_path FROM images WHERE uid = ?",
                (token,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            raise HTTPException(status_code=404, detail="文件不存在")
        name = row["original_path"] if kind == "originals" else row["thumbnail_path"]
        path = folder / name
        if not path.exists():
            raise HTTPException(status_code=404, detail="文件不存在")
        return _safe_media(folder, path)

    @app.get("/media/thumbnails/{uid}")
    def media_thumb(uid: str):
        return _media_file("thumbnails", uid)

    @app.get("/media/originals/{uid}")
    def media_original(uid: str):
        return _media_file("originals", uid)

    @app.get("/media/board-previews/{board_id}")
    def media_board_preview(board_id: str):
        token = Path(board_id).name.split(".")[0]
        if not token.isdigit():
            raise HTTPException(status_code=404, detail="文件不存在")
        folder = board_previews_dir()
        path = folder / f"{token}.jpg"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="文件不存在")
        return _safe_media(folder, path)

    app.include_router(images_router, prefix="/api/v1")
    app.include_router(tags_router, prefix="/api/v1")
    app.include_router(search_router, prefix="/api/v1")
    app.include_router(boards_router, prefix="/api/v1")
    app.include_router(meta_router, prefix="/api/v1")
    return app


app = create_app()


if __name__ == "__main__":
    import argparse
    import os
    import socket

    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    port = args.port or int(os.environ.get("POSEBOARD_PORT") or 0)
    if not port:
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
    print(f"POSEBOARD_PORT={port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=port)
