package aliyun

import (
	"context"
	"fmt"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
	"os"
)

type OssClient struct {
	*oss.Client
	Bucket string
}

func NewOssClient(accessKeyID, accessKeySecret, bucket string) *OssClient {
	credProvider := credentials.NewStaticCredentialsProvider(accessKeyID, accessKeySecret)

	cfg := oss.LoadDefaultConfig().
		WithCredentialsProvider(credProvider).
		WithRegion("cn-shanghai")

	client := oss.NewClient(cfg)

	return &OssClient{client, bucket}
}

func (o *OssClient) UploadFile(ctx context.Context, objectKey, filePath, bucket string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	_, err = o.PutObject(ctx, &oss.PutObjectRequest{
		Bucket: &bucket,
		Key:    &objectKey,
		Body:   file,
	})
	if err != nil {
		return fmt.Errorf("failed to upload file to OSS: %v", err)
	}

	fmt.Printf("File %s uploaded successfully to bucket %s as %s\n", filePath, bucket, objectKey)
	return nil
}
