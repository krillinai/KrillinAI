package service

import (
	"context"
	"krillin-ai/config"

	"golang.org/x/sync/errgroup"
)

func translationParallelism() int {
	if config.Conf.App.TranslateParallelNum > 0 {
		return config.Conf.App.TranslateParallelNum
	}
	return 3
}

func runTranslationBatches(ctx context.Context, count int, translate func(context.Context, int) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if count == 0 {
		return nil
	}
	group, ctx := errgroup.WithContext(ctx)
	jobs := make(chan int)
	group.Go(func() error {
		defer close(jobs)
		for index := 0; index < count; index++ {
			select {
			case jobs <- index:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		return nil
	})
	for range min(translationParallelism(), count) {
		group.Go(func() error {
			for index := range jobs {
				if err := ctx.Err(); err != nil {
					return err
				}
				if err := translate(ctx, index); err != nil {
					return err
				}
			}
			return ctx.Err()
		})
	}
	return group.Wait()
}
