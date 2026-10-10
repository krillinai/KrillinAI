package util

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

var bilibiliVideoPath = regexp.MustCompile(`^/video/(BV[A-Za-z0-9]+|av[0-9]+)/?$`)
var bilibiliPartNumber = regexp.MustCompile(`^[1-9][0-9]*$`)

func NormalizeBilibiliVideoURL(value string) (string, error) {
	source, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return "", fmt.Errorf("invalid Bilibili video URL: %w", err)
	}
	host := strings.ToLower(source.Hostname())
	if (source.Scheme != "http" && source.Scheme != "https") || (host != "bilibili.com" && !strings.HasSuffix(host, ".bilibili.com")) {
		return "", fmt.Errorf("invalid Bilibili video URL")
	}
	match := bilibiliVideoPath.FindStringSubmatch(source.Path)
	if len(match) != 2 {
		return "", fmt.Errorf("invalid Bilibili video ID")
	}
	query, err := url.ParseQuery(source.RawQuery)
	if err != nil {
		return "", fmt.Errorf("invalid Bilibili video query: %w", err)
	}
	parts := query["p"]
	part := "1"
	if len(parts) > 0 {
		if len(parts) != 1 || !bilibiliPartNumber.MatchString(parts[0]) {
			return "", fmt.Errorf("invalid Bilibili part: select a positive part number")
		}
		index, parseErr := strconv.ParseUint(parts[0], 10, 53)
		if parseErr != nil || index == 0 {
			return "", fmt.Errorf("invalid Bilibili part number")
		}
		part = strconv.FormatUint(index, 10)
	}
	return "https://www.bilibili.com/video/" + match[1] + "?p=" + part, nil
}
