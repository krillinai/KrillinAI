package service

import "krillin-ai/internal/dto"

func convertToTranslatedItem(dtoList []dto.TranslatedItemDTO) []TranslatedItem {
	var resultList []TranslatedItem

	for _, dto := range dtoList {
		item := TranslatedItem{
			OriginText:     dto.OriginText,
			TranslatedText: dto.TranslatedText,
		}
		resultList = append(resultList, item)
	}

	return resultList
}
