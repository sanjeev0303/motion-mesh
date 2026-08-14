import requests
from typing import Optional, Dict, Any

class MotionMeshClient:
    """Client for the MotionMesh API."""

    def __init__(self, api_key: str):
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError("MotionMesh API key is required")
        self.api_key = api_key.strip()
        if not (self.api_key.startswith("mot_live_") or self.api_key.startswith("mot_test_")):
            raise ValueError("Invalid MotionMesh API key")
        self.base_url = "https://api.motionmesh.co.in/v1"
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        if response.status_code == 204:
            return None
        return response.json()

    # --- Videos ---
    def list_videos(self) -> Dict[str, Any]:
        return self._request("GET", "/videos")

    def create_video(self, filename: str, size_bytes: int) -> Dict[str, Any]:
        return self._request("POST", "/videos", json={
            "filename": filename,
            "size_bytes": size_bytes
        })

    def get_video(self, video_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/videos/{video_id}")

    def delete_video(self, video_id: str) -> None:
        self._request("DELETE", f"/videos/{video_id}")

    # --- Branding ---
    def get_branding(self) -> Dict[str, Any]:
        return self._request("GET", "/branding")

    def update_branding(self, position: str, opacity: float) -> Dict[str, Any]:
        return self._request("PUT", "/branding", json={
            "position": position,
            "opacity": opacity
        })

    def upload_watermark_asset(self, file_path: str) -> Dict[str, Any]:
        with open(file_path, "rb") as f:
            # Drop the Content-Type header so requests can set the multipart boundary
            headers = self.session.headers.copy()
            if "Content-Type" in headers:
                del headers["Content-Type"]
            response = requests.post(
                f"{self.base_url}/branding/asset",
                headers=headers,
                files={"asset": f}
            )
            response.raise_for_status()
            return response.json()

    # --- API Keys ---
    def list_api_keys(self) -> Dict[str, Any]:
        return self._request("GET", "/api-keys")

    def create_api_key(self) -> Dict[str, Any]:
        return self._request("POST", "/api-keys")

    def revoke_api_key(self, prefix: str) -> None:
        self._request("DELETE", f"/api-keys/{prefix}")
