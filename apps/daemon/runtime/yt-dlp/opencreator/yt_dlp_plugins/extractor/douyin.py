from hashlib import md5
from urllib.parse import urlencode, urlsplit

from yt_dlp.extractor.tiktok import DouyinIE as UpstreamDouyinIE
from yt_dlp.networking.exceptions import HTTPError
from yt_dlp.utils import ExtractorError


class DouyinIE(UpstreamDouyinIE, plugin_name="opencreator"):
    def _download_json(self, url_or_request, video_id, *args, **kwargs):
        parsed = urlsplit(url_or_request) if isinstance(url_or_request, str) else None
        if not parsed or parsed.hostname != "www.douyin.com" or parsed.path != "/aweme/v1/web/aweme/detail/":
            return super()._download_json(url_or_request, video_id, *args, **kwargs)

        headers = dict(kwargs.get("headers") or {})
        query = dict(kwargs.get("query") or {})
        cookies = self._get_cookies(self._WEBPAGE_HOST)
        identity_cookie = cookies.get("UIFID") or cookies.get("UIFID_TEMP")
        identity = query.get("uifid") or (identity_cookie.value if identity_cookie else None)
        if identity:
            headers["uifid"] = identity
            query["uifid"] = identity
            if not query.get("x-secsdk-web-signature"):
                # URLSearchParams encoding and checksum documented in yt-dlp issue #9667:
                # https://github.com/yt-dlp/yt-dlp/issues/9667#issuecomment-6113069189
                encoded_query = urlencode(query, doseq=True, safe="*").replace("~", "%7E")
                payload = f"{identity}_{query.get('timestamp', '')}_A96D855A08C0A9707F8BEF0D9A527E4E_{encoded_query}"
                query["x-secsdk-web-signature"] = md5(payload.encode(), usedforsecurity=False).hexdigest()
        fatal = kwargs.get("fatal", True)
        # The upstream nonfatal request discards the response body and labels every
        # rejection as stale cookies. Read only the bounded, known rejection reason.
        try:
            return super()._download_json(url_or_request, video_id, *args, **{
                **kwargs, "headers": headers, "query": query, "fatal": True,
            })
        except ExtractorError as error:
            cause = error.cause
            if isinstance(cause, HTTPError) and cause.status == 403:
                body = cause.response.read(512)
                if b"Blocked by ArgusSecurityPlugin Signature Not Found" in body:
                    raise ExtractorError(
                        "Douyin request signature is required (HTTP Error 403; Signature Not Found). "
                        "The current downloader is incompatible with this platform verification; "
                        "reconnecting cookies alone cannot fix it. Use a local video file.",
                        expected=True,
                    ) from error
                if b"Blocked by ArgusSecurityPlugin Uifid Not Found" in body:
                    raise ExtractorError(
                        "Douyin browser identity was rejected (HTTP Error 403; Uifid Not Found). "
                        "Connect Douyin in Settings > Platform connections and retry.",
                        expected=True,
                    ) from error
            if fatal:
                raise
            self.report_warning(str(error))
            return None
