package types

type WhispercppOutput struct {
	SystemInfo string `json:"systeminfo"`
	Model      struct {
		Type         string `json:"type"`
		Multilingual bool   `json:"multilingual"`
		Vocab        int    `json:"vocab"`
		Audio        struct {
			Ctx   int `json:"ctx"`
			State int `json:"state"`
			Head  int `json:"head"`
			Layer int `json:"layer"`
		} `json:"audio"`
		Text struct {
			Ctx   int `json:"ctx"`
			State int `json:"state"`
			Head  int `json:"head"`
			Layer int `json:"layer"`
		} `json:"text"`
		Mels  int `json:"mels"`
		Ftype int `json:"ftype"`
	} `json:"model"`
	Params struct {
		Model     string `json:"model"`
		Language  string `json:"language"`
		Translate bool   `json:"translate"`
	} `json:"params"`
	Result struct {
		Language string `json:"language"`
	} `json:"result"`
	Transcription []struct {
		Timestamps struct {
			From string `json:"from"`
			To   string `json:"to"`
		} `json:"timestamps"`
		Offsets struct {
			From int `json:"from"`
			To   int `json:"to"`
		} `json:"offsets"`
		Text   string `json:"text"`
		Tokens []struct {
			Text       string `json:"text"`
			Timestamps struct {
				From string `json:"from"`
				To   string `json:"to"`
			} `json:"timestamps"`
			Offsets struct {
				From int `json:"from"`
				To   int `json:"to"`
			} `json:"offsets"`
			ID   int     `json:"id"`
			P    float64 `json:"p"`
			TDtw int     `json:"t_dtw"`
		} `json:"tokens"`
	} `json:"transcription"`
}
