package cambai

import (
	"fmt"
	"io"
	"krillin-ai/config"
	"net/http"
	"os"
	"strings"

	"krillin-ai/log"

	"go.uber.org/zap"
)

type Client struct {
	ApiKey  string
	BaseURL string
	Model   string
}

// langCodeToBCP47 maps KrillinAI language codes to Camb AI BCP-47 TTS codes.
var langCodeToBCP47 = map[string]string{
	"en":    "en-us",
	"zh_cn": "zh-cn",
	"zh_tw": "zh-cn",
	"ja":    "ja-jp",
	"ko":    "ko-kr",
	"es":    "es-es",
	"fr":    "fr-fr",
	"de":    "de-de",
	"it":    "it-it",
	"pt":    "pt-br",
	"ru":    "ru-ru",
	"ar":    "ar-sa",
	"hi":    "hi-in",
	"nl":    "nl-nl",
	"ta":    "ta-in",
	"te":    "te-in",
	"bn":    "bn-in",
}

func NewClient(apiKey, model string) *Client {
	if model == "" {
		model = "mars-flash"
	}
	return &Client{
		ApiKey:  apiKey,
		BaseURL: "https://client.camb.ai/apis",
		Model:   model,
	}
}

// ResolveLang returns the BCP-47 language code for Camb AI TTS.
// Priority: explicit config > auto-detect from language code > fallback to en-us.
func ResolveLang(langCode string) string {
	if explicit := config.Conf.Tts.Cambai.Language; explicit != "" {
		return explicit
	}
	if bcp47, ok := langCodeToBCP47[langCode]; ok {
		return bcp47
	}
	return "en-us"
}

func (c *Client) Text2Speech(text, voice string, outputFile string) error {
	url := c.BaseURL + "/tts-stream"

	// Auto-detect language from text characteristics as a best-effort heuristic,
	// but prefer explicit config if set
	lang := ResolveLang(detectLangFromText(text))

	reqBody := fmt.Sprintf(`{
		"text": %q,
		"voice_id": %s,
		"language": %q,
		"speech_model": %q,
		"output_configuration": {"format": "wav"}
	}`, text, voice, lang, c.Model)

	req, err := http.NewRequest("POST", url, strings.NewReader(reqBody))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.ApiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.GetLogger().Error("cambai tts failed", zap.Int("status_code", resp.StatusCode), zap.String("body", string(body)))
		return fmt.Errorf("cambai tts non-200 status code: %d", resp.StatusCode)
	}

	file, err := os.Create(outputFile)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		return err
	}

	return nil
}

// detectLangFromText does a simple heuristic check on text to guess the language code.
func detectLangFromText(text string) string {
	for _, r := range text {
		if r >= 0x4E00 && r <= 0x9FFF {
			return "zh_cn"
		}
		if r >= 0x3040 && r <= 0x30FF {
			return "ja"
		}
		if r >= 0xAC00 && r <= 0xD7AF {
			return "ko"
		}
		if r >= 0x0600 && r <= 0x06FF {
			return "ar"
		}
		if r >= 0x0900 && r <= 0x097F {
			return "hi"
		}
	}
	return "en"
}
