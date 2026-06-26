"""
Sniper Automation API Routes
Handles content fetching, posting, and automation
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

router = APIRouter()


def _sb():
    return create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_KEY", ""),
    )


class SchedulePostRequest(BaseModel):
    user_id: str
    content: str
    target_groups: List[str] = []   # target_group UUIDs
    target_pages:  List[str] = []   # FB page IDs
    scheduled_at:  Optional[str] = None
    frequency:     str = "once"     # "once" | "daily"
    media_url:             Optional[str] = None
    comment:               Optional[str] = None
    comment_delay_minutes: int = 0


class PostRequest(BaseModel):
    group_id: str
    message: str
    access_token: str


class CommentRequest(BaseModel):
    post_id: str
    message: str
    access_token: str


class LikeRequest(BaseModel):
    post_id: str
    access_token: str


class FetchFeedRequest(BaseModel):
    group_id: str
    access_token: str
    limit: int = 25


@router.post("/schedule-post")
async def schedule_post(req: SchedulePostRequest):
    """
    Create a scheduled post campaign + optional paired first comment atomically.
    The worker fires the comment instantly after the post returns a fb_post_id.
    """
    if not req.target_groups and not req.target_pages:
        raise HTTPException(status_code=422, detail="Provide at least one target group or page.")
    if not req.content.strip():
        raise HTTPException(status_code=422, detail="Post content cannot be empty.")

    sb = _sb()
    try:
        from datetime import datetime, timezone
        initial_status = "pending"
        if req.scheduled_at:
            try:
                sched_dt = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
                if sched_dt > datetime.now(timezone.utc):
                    initial_status = "scheduled"
            except Exception:
                pass

        post_row = (
            sb.table("automation_posts")
            .insert({
                "user_id":       req.user_id,
                "content":       req.content.strip(),
                "target_groups": req.target_groups,
                "target_pages":  req.target_pages,
                "status":        initial_status,
                "scheduled_at":  req.scheduled_at,
                "metadata": {
                    "action_type": "Post to group/page",
                    "frequency":   req.frequency,
                    "media_url":   req.media_url,
                },
            })
            .execute()
        )
        post_id = post_row.data[0]["id"]

        comment_id = None
        if req.comment and req.comment.strip():
            delay = max(0, req.comment_delay_minutes)
            comment_row = (
                sb.table("post_scheduled_comments")
                .insert({
                    "user_id":       req.user_id,
                    "post_id":       post_id,
                    "content":       req.comment.strip(),
                    "status":        "pending",
                    "delay_minutes": delay,
                })
                .execute()
            )
            comment_id = comment_row.data[0]["id"]

        return {
            "success":    True,
            "post_id":    post_id,
            "comment_id": comment_id,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/post-to-group")
async def post_to_group(request: PostRequest):
    """
    Post a message to a Facebook group.
    """
    try:
        from app.services.meta import get_meta_api
        
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        meta_api = get_meta_api(app_id, app_secret)
        result = await meta_api.post_to_group(
            request.group_id, request.message, request.access_token
        )
        
        return {"success": True, "post_id": result.get("id")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/comment")
async def comment_on_post(request: CommentRequest):
    """
    Comment on a Facebook post.
    """
    try:
        from app.services.meta import get_meta_api
        
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        meta_api = get_meta_api(app_id, app_secret)
        result = await meta_api.comment_on_post(
            request.post_id, request.message, request.access_token
        )
        
        return {"success": True, "comment_id": result.get("id")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/like")
async def like_post(request: LikeRequest):
    """
    Like a Facebook post.
    """
    try:
        from app.services.meta import get_meta_api
        
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        meta_api = get_meta_api(app_id, app_secret)
        result = await meta_api.like_post(request.post_id, request.access_token)
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/fetch-feed")
async def fetch_group_feed(request: FetchFeedRequest):
    """
    Fetch feed/posts from a Facebook group.
    """
    try:
        from app.services.meta import get_meta_api
        
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        meta_api = get_meta_api(app_id, app_secret)
        feed = await meta_api.get_group_feed(
            request.group_id, request.access_token, request.limit
        )
        
        return {"success": True, "feed": feed}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/groups")
async def get_user_groups(access_token: str, limit: int = 25):
    """
    Get groups the user is a member of.
    """
    try:
        from app.services.meta import get_meta_api
        
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        meta_api = get_meta_api(app_id, app_secret)
        groups = await meta_api.get_user_groups(access_token, limit)
        
        return {"success": True, "groups": groups}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/pages")
async def get_user_pages(access_token: str, limit: int = 25):
    """
    Get pages the user manages.
    """
    try:
        from app.services.meta import get_meta_api
        
        app_id = os.getenv("META_APP_ID")
        app_secret = os.getenv("META_APP_SECRET")
        
        meta_api = get_meta_api(app_id, app_secret)
        pages = await meta_api.get_user_pages(access_token, limit)
        
        return {"success": True, "pages": pages}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
