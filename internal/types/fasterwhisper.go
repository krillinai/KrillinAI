package types

type FasterWhisperOutput struct {
	Segments []struct {
		Id               int     `json:"id"`
		Seek             int     `json:"seek"`
		Start            float64 `json:"start"`
		End              float64 `json:"end"`
		Text             string  `json:"text"`
		Tokens           []int   `json:"tokens"`
		Temperature      float64 `json:"temperature"`
		AvgLogprob       float64 `json:"avg_logprob"`
		CompressionRatio float64 `json:"compression_ratio"`
		NoSpeechProb     float64 `json:"no_speech_prob"`
		Words            []struct {
			Start       float64 `json:"start"`
			End         float64 `json:"end"`
			Word        string  `json:"word"`
			Probability float64 `json:"probability"`
		} `json:"words"`
	} `json:"segments"`
	Language string `json:"language"`
	Text     string `json:"text"`
}
