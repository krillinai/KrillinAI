import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, sys.argv[1])
plugin_root = sys.argv[2]
sys.argv = [sys.argv[0]]

import yt_dlp
from yt_dlp.globals import plugin_dirs
from yt_dlp.utils import DownloadError

plugin_dirs.value = [plugin_root]


def audio(format_id):
    return {
        "id": format_id, "baseUrl": "https://media.example.com/audio.m4s",
        "mimeType": "audio/mp4", "codecs": "mp4a.40.2", "bandwidth": format_id,
    }


def playinfo(format_id):
    return {"dash": {"audio": [audio(format_id)]}, "timelength": 10000}


class Logger:
    def __init__(self):
        self.messages = []

    def debug(self, message):
        pass

    def warning(self, message):
        self.messages.append(message)

    def error(self, message):
        self.messages.append(message)


class BilibiliRegression(unittest.TestCase):
    def extract(self, webpage_info, api_response, format_selector="bestaudio[ext=m4a]"):
        webpage = "<script>window.__INITIAL_STATE__=" + json.dumps({
            "videoData": {"bvid": "BV18Qhf6hE8P", "aid": 117323440657857,
                          "cid": 42150005194, "title": "fixture",
                          "pages": [{"cid": 42150005194}]}
        }) + ";window.__playinfo__=" + json.dumps({"data": webpage_info}) + ";</script>"

        def response(url, *args, **kwargs):
            if "/playurl" in url:
                return api_response
            if "/pagelist" in url:
                return {"data": [{"page": 1, "cid": 42150005194}]}
            return {"data": {}}

        self.logger = Logger()
        with yt_dlp.YoutubeDL({
            "logger": self.logger, "noplaylist": True, "skip_download": True,
            "format": format_selector,
        }) as ydl:
            extractor = ydl.get_info_extractor("BiliBili")
            self.assertEqual(extractor.PLUGIN_NAME, "opencreator")
            with patch.object(extractor, "_download_webpage", return_value=webpage), \
                    patch.object(extractor, "_download_webpage_handle", return_value=(webpage, SimpleNamespace(url="https://www.bilibili.com/video/BV18Qhf6hE8P?p=1"))), \
                    patch.object(extractor, "_download_json", side_effect=response), \
                    patch.object(extractor, "_sign_wbi", side_effect=lambda params, video_id: params), \
                    patch.object(ydl, "urlopen", side_effect=AssertionError("Unexpected network request")):
                return ydl.extract_info("https://www.bilibili.com/video/BV18Qhf6hE8P?p=1", download=False)

    def test_challenge_keeps_webpage_audio(self):
        result = self.extract(playinfo(30216), {"code": 0, "data": {"v_voucher": "secret-voucher"}})
        self.assertEqual(result["format_id"], "30216")
        self.assertNotIn("secret-voucher", "\n".join(self.logger.messages))

    def test_empty_api_response_keeps_webpage_audio(self):
        result = self.extract(playinfo(30216), {"code": 0, "data": {"dash": {"audio": []}}})
        self.assertEqual(result["format_id"], "30216")

    def test_challenge_keeps_webpage_video_and_audio(self):
        info = playinfo(30216)
        info["dash"]["video"] = [{
            "id": 80, "baseUrl": "https://media.example.com/video.m4s",
            "mimeType": "video/mp4", "codecs": "avc1.640028", "height": 1080,
        }]
        result = self.extract(info, {"code": 0, "data": {"v_voucher": "secret-voucher"}}, "bestvideo+bestaudio")
        self.assertEqual([stream["format_id"] for stream in result["requested_formats"]], ["80", "30216"])

    def test_malformed_streams_keep_webpage_audio(self):
        result = self.extract(playinfo(30216), {"code": 0, "data": {"dash": {"audio": [{"id": 30280}]}}})
        self.assertEqual(result["format_id"], "30216")

    def test_valid_api_formats_still_take_precedence(self):
        result = self.extract(playinfo(30216), {"code": 0, "data": playinfo(30280)})
        self.assertEqual(result["format_id"], "30280")

    def test_no_webpage_formats_reports_risk_control(self):
        with self.assertRaisesRegex(DownloadError, "Bilibili risk control rejected the media request"):
            self.extract({}, {"code": 0, "data": {"v_voucher": "secret-voucher"}})

    def test_missing_formats_without_challenge_is_not_labeled_risk_control(self):
        with self.assertRaisesRegex(DownloadError, "No video formats found"):
            self.extract({}, {"code": 0, "data": {}})
        self.assertNotIn("risk control", "\n".join(self.logger.messages))

    def test_dolby_flac_and_legacy_formats_are_preserved(self):
        for info in [
            {"dash": {"dolby": {"audio": [audio(30280)]}}},
            {"dash": {"flac": {"audio": audio(30280)}}},
            {"durl": [{"url": "https://media.example.com/source.mp4", "size": 100, "length": 10000}]},
        ]:
            with self.subTest(info=info):
                result = self.extract({}, {"code": 0, "data": info}, "best")
                self.assertTrue(result["formats"])


unittest.main()
