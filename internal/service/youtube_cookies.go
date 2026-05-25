package service

import (
	"bufio"
	"os"
	"strings"

	"krillin-ai/log"

	"go.uber.org/zap"
)

const youtubeCookiesPath = "./cookies.txt"

func appendCookiesArgs(args []string, cookiesPath string) []string {
	if !isNetscapeCookiesFile(cookiesPath) {
		return args
	}

	if logger := log.GetLogger(); logger != nil {
		logger.Info("Using cookies for yt-dlp authentication", zap.String("cookiesPath", cookiesPath))
	}
	return append(args, "--cookies", cookiesPath)
}

func isNetscapeCookiesFile(cookiesPath string) bool {
	file, err := os.Open(cookiesPath)
	if err != nil {
		if !os.IsNotExist(err) {
			if logger := log.GetLogger(); logger != nil {
				logger.Warn("Failed to open cookies file, skipping cookies", zap.String("cookiesPath", cookiesPath), zap.Error(err))
			}
		}
		return false
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		line = strings.TrimPrefix(line, "\ufeff")
		if strings.HasPrefix(line, "# Netscape HTTP Cookie File") {
			return true
		}
		if logger := log.GetLogger(); logger != nil {
			logger.Warn("Cookies file is not Netscape format, skipping cookies", zap.String("cookiesPath", cookiesPath))
		}
		return false
	}

	if err := scanner.Err(); err != nil {
		if logger := log.GetLogger(); logger != nil {
			logger.Warn("Failed to read cookies file, skipping cookies", zap.String("cookiesPath", cookiesPath), zap.Error(err))
		}
	}
	return false
}
