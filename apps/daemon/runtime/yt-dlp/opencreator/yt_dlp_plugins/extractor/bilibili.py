from yt_dlp.extractor.bilibili import BiliBiliIE as UpstreamBiliBiliIE
from yt_dlp.utils import ExtractorError, traverse_obj, url_or_none


def has_media_formats(play_info):
    return any(
        traverse_obj(
            play_info, (*path, ("baseUrl", "base_url", "url"), {url_or_none}), default=[]
        )
        for path in (
            ("dash", ("audio", "video"), ..., {dict}),
            ("dash", "dolby", "audio", ..., {dict}),
            ("dash", "flac", "audio", {dict}),
            ("durl", ..., {dict}),
        )
    )


class BiliBiliIE(UpstreamBiliBiliIE, plugin_name="opencreator"):
    def _download_playinfo(self, *args, **kwargs):
        play_info = super()._download_playinfo(*args, **kwargs)
        if has_media_formats(play_info):
            return play_info
        if isinstance(play_info, dict) and play_info.get("v_voucher"):
            self._opencreator_risk_control = True
            self.report_warning(
                "Bilibili risk control rejected the playback API request; "
                "retaining webpage media formats when available"
            )
        # A nonempty challenge dictionary must not replace valid webpage media.
        return None

    def _real_extract(self, url):
        self._opencreator_risk_control = False
        result = super()._real_extract(url)
        if self._opencreator_risk_control and result.get("formats") == []:
            raise ExtractorError(
                "Bilibili risk control rejected the media request. "
                "Wait and retry, or use a local video file.",
                expected=True,
            )
        return result
