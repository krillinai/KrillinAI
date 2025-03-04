package types

type WhisperKitOutput struct {
	Text     string `json:"text"`
	Language string `json:"language"`
	Segments []struct {
		Seek             int                  `json:"seek"`
		Tokens           []int                `json:"tokens"`
		CompressionRatio float64              `json:"compressionRatio"`
		Temperature      float64              `json:"temperature"`
		AvgLogprob       float64              `json:"avgLogprob"`
		NoSpeechProb     float64              `json:"noSpeechProb"`
		Id               int                  `json:"id"`
		TokenLogProbs    []map[string]float64 `json:"tokenLogProbs"`
		Start            float64              `json:"start"`
		Words            []struct {
			Start       float64 `json:"start"`
			End         float64 `json:"end"`
			Word        string  `json:"word"`
			Probability float64 `json:"probability"`
			Tokens      []int   `json:"tokens"`
		} `json:"words"`
		Text string  `json:"text"`
		End  float64 `json:"end"`
	} `json:"segments"`
}
