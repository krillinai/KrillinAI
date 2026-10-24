package service

import (
	"encoding/json"
	"fmt"
	"krillin-ai/pkg/util"
	"strings"
)

// The reference's concrete origin/direct/reflect/free table makes each edit a
// separate decision. Parent metadata preserves context and atomic ID coverage.
type segmentEditorLine struct {
	Origin  string                `json:"origin"`
	Direct  string                `json:"direct"`
	Reflect string                `json:"reflect"`
	Free    string                `json:"free"`
	IDs     []string              `json:"segment_ids,omitempty"`
	Terms   []segmentTermDecision `json:"term_decisions,omitempty"`
}

const segmentEditorSchemaMarker = "\n## Output JSON\n"

func makeSegmentEditorPrompt(input segmentRequest, filterFillers bool) string {
	prompt := strings.NewReplacer("{{source_language}}", input.SourceLanguage, "{{target_language}}", input.TargetLanguage).Replace(segmentExpressivePrompt)
	metadata := input
	metadata.Parents = nil
	// Build in input order rather than sorting string IDs (1.10 must follow 1.9).
	var schema strings.Builder
	schema.WriteString("{\n")
	count := 0
	for _, parent := range input.Parents {
		local := parent
		local.Units = nil
		for _, unit := range parent.Units {
			local.Units = append(local.Units, segmentPromptUnit{ID: unit.ID})
			draft := unit.Target
			if draft == "" {
				draft = unit.Direct
			}
			line, _ := json.Marshal(segmentEditorLine{Origin: unit.Source, Direct: draft, Reflect: "your reflection on direct translation", Free: "your free translation"})
			key, _ := json.Marshal(unit.ID)
			if count > 0 {
				schema.WriteString(",\n")
			}
			schema.Write(key)
			schema.WriteString(":")
			schema.Write(line)
			count++
		}
		metadata.Parents = append(metadata.Parents, local)
	}
	schema.WriteString("\n}")
	data, _ := json.Marshal(metadata)
	if filterFillers {
		prompt += "\nOmit meaningless hesitation sounds from target subtitles; preserve meaningful uncertainty and emphasis.\n"
	}
	return prompt + "\n输入 JSON：\n" + string(data) + segmentEditorSchemaMarker + schema.String()
}

// Older structured replies are still validated by the same coverage checks.
// Keyed editor replies additionally reject duplicate and unknown IDs outright.
func decodeSegmentEditorJSON(response string, input segmentRequest, output *segmentResponse) error {
	if len(input.Parents) == 0 || len(input.Parents[0].Units) == 0 {
		return fmt.Errorf("empty editor request")
	}
	first := input.Parents[0].Units[0].ID
	data := util.ExtractJSONObject(response, first)
	if !json.Valid([]byte(data)) {
		closed, err := closeSegmentJSON(data)
		if err != nil {
			return err
		}
		data = closed
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal([]byte(data), &root); err != nil {
		return err
	}
	if _, ok := root["sentences"]; ok {
		return decodeSegmentJSON(response, output)
	}
	decoder := json.NewDecoder(strings.NewReader(data))
	if _, err := decoder.Token(); err != nil {
		return err
	}
	lines := map[string]segmentEditorLine{}
	for decoder.More() {
		key, err := decoder.Token()
		if err != nil {
			return err
		}
		id, ok := key.(string)
		if !ok {
			return fmt.Errorf("invalid editor ID")
		}
		if _, exists := lines[id]; exists {
			return fmt.Errorf("duplicate editor ID %s", id)
		}
		var line segmentEditorLine
		if err := decoder.Decode(&line); err != nil {
			return err
		}
		lines[id] = line
	}
	*output = segmentResponse{}
	used := map[string]bool{}
	for _, parent := range input.Parents {
		item := segmentResponseParent{ID: parent.ID}
		for _, unit := range parent.Units {
			line, exists := lines[unit.ID]
			if !exists {
				continue
			} // generation reports missing coverage per parent.
			if len(line.IDs) > 0 && line.IDs[0] != unit.ID {
				return fmt.Errorf("merged editor key must be its first ID")
			}
			used[unit.ID] = true
			item.TermDecisions = append(item.TermDecisions, line.Terms...)
			item.Segments = append(item.Segments, segmentResponseUnit{ID: unit.ID, IDs: line.IDs, Target: line.Free, Reflect: line.Reflect})
		}
		output.Sentences = append(output.Sentences, item)
	}
	if len(used) != len(lines) {
		return fmt.Errorf("unknown editor segment ID")
	}
	return nil
}
