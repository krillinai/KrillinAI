import io
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, sys.argv[1])
plugin_root = sys.argv[2]
sys.argv = [sys.argv[0]]

import yt_dlp
from yt_dlp.extractor.tiktok import DouyinIE as UpstreamDouyinIE
from yt_dlp.globals import plugin_dirs
from yt_dlp.networking.common import Response
from yt_dlp.networking.exceptions import HTTPError
from yt_dlp.utils import ExtractorError

plugin_dirs.value = [plugin_root]
URL = "https://www.douyin.com/video/7693859410975690010"
API = "https://www.douyin.com/aweme/v1/web/aweme/detail/"


class DouyinRegression(unittest.TestCase):
    def setUp(self):
        self.ydl = yt_dlp.YoutubeDL({"quiet": True, "skip_download": True})
        self.extractor = self.ydl.get_info_extractor("Douyin")
        self.assertEqual(self.extractor.PLUGIN_NAME, "opencreator")

    def tearDown(self):
        self.ydl.close()

    def error(self, body, status=403):
        response = Response(io.BytesIO(body), API, {}, status=status)
        return ExtractorError("Unable to download JSON metadata", cause=HTTPError(response))

    def test_signed_detail_request_preserves_upstream_media_parsing(self):
        detail = {"aweme_id": "7693859410975690010"}
        with patch.object(self.extractor, "_get_cookies", return_value={"UIFID": SimpleNamespace(value="private-identity")}), \
                patch.object(UpstreamDouyinIE, "_download_json", return_value={"aweme_detail": detail}) as request, \
                patch.object(self.extractor, "_parse_aweme_video_app", return_value={"id": detail["aweme_id"]}) as parse:
            self.assertEqual(self.extractor._real_extract(URL), {"id": detail["aweme_id"]})
            self.assertEqual(request.call_args.kwargs["headers"]["uifid"], "private-identity")
            self.assertEqual(request.call_args.kwargs["query"], {
                "aweme_id": detail["aweme_id"], "uifid": "private-identity",
                "x-secsdk-web-signature": "62911035327db934b912fe8bcdc903bc",
            })
            self.assertTrue(request.call_args.kwargs["fatal"])
            parse.assert_called_once_with(detail)

    def test_temporary_identity_cookie_can_sign_without_a_logged_in_account(self):
        with patch.object(self.extractor, "_get_cookies", return_value={"UIFID_TEMP": SimpleNamespace(value="private-identity")}), \
                patch.object(UpstreamDouyinIE, "_download_json", return_value={}) as request:
            self.extractor._download_json(API, "id", query={"aweme_id": "7693859410975690010"})
        self.assertEqual(request.call_args.kwargs["query"]["x-secsdk-web-signature"], "62911035327db934b912fe8bcdc903bc")

    def test_signature_matches_urlsearchparams_encoding_and_optional_timestamp(self):
        query = {"aweme_id": "7693859410975690010", "timestamp": "1787265814"}
        with patch.object(self.extractor, "_get_cookies", return_value={"UIFID": SimpleNamespace(value="identity /+~*&")}), \
                patch.object(UpstreamDouyinIE, "_download_json", return_value={}) as request:
            self.extractor._download_json(API, "id", query=query)
        self.assertEqual(request.call_args.kwargs["query"]["x-secsdk-web-signature"], "b930c2b3bf997a7ba1d52f1c6216d5cb")
        self.assertEqual(query, {"aweme_id": "7693859410975690010", "timestamp": "1787265814"})

    def test_upstream_signed_requests_are_preserved(self):
        query = {"aweme_id": "id", "uifid": "upstream-identity", "x-secsdk-web-signature": "upstream-signature"}
        with patch.object(self.extractor, "_get_cookies", return_value={"UIFID": SimpleNamespace(value="other-identity")}), \
                patch.object(UpstreamDouyinIE, "_download_json", return_value={}) as request:
            self.extractor._download_json(API, "id", query=query)
        self.assertEqual(request.call_args.kwargs["query"], query)
        self.assertEqual(request.call_args.kwargs["headers"]["uifid"], "upstream-identity")

    def test_signature_rejection_is_not_mislabeled_as_stale_cookies(self):
        with patch.object(UpstreamDouyinIE, "_download_json", side_effect=self.error(
                b"Blocked by ArgusSecurityPlugin Signature Not Found private-server-token")):
            with self.assertRaises(ExtractorError) as result:
                self.extractor._real_extract(URL)
        message = str(result.exception)
        self.assertIn("Douyin request signature is required", message)
        self.assertIn("HTTP Error 403", message)
        self.assertNotIn("Fresh cookies", message)
        self.assertNotIn("private-server-token", message)

    def test_missing_identity_is_reported_as_a_connection_requirement(self):
        with patch.object(UpstreamDouyinIE, "_download_json", side_effect=self.error(
                b"Blocked by ArgusSecurityPlugin Uifid Not Found")):
            with self.assertRaisesRegex(ExtractorError, "Douyin browser identity was rejected"):
                self.extractor._real_extract(URL)

    def test_unrecognized_nonfatal_rejection_preserves_upstream_behavior(self):
        with patch.object(UpstreamDouyinIE, "_download_json", side_effect=self.error(b"unrecognized")), \
                patch.object(self.extractor, "report_warning"):
            with self.assertRaisesRegex(ExtractorError, "Fresh cookies"):
                self.extractor._real_extract(URL)

    def test_other_json_endpoints_keep_their_original_headers_and_error_policy(self):
        with patch.object(UpstreamDouyinIE, "_download_json", return_value={}) as request:
            self.extractor._download_json("https://api.example.com/metadata", "id", headers={"test": "value"}, fatal=False)
            self.assertEqual(request.call_args.kwargs, {"headers": {"test": "value"}, "fatal": False})


unittest.main()
