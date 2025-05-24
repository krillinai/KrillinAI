package types

type WhisperXOutput struct {
	Language string `json:"language"`
	Segments []struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Words []struct {
			Start       float64 `json:"start"`
			End         float64 `json:"end"`
			Word        string  `json:"word"`
			Probability float64 `json:"score"`
		} `json:"words"`
		Text string `json:"text"`
	} `json:"segments"`
}
