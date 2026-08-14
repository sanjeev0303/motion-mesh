package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/cloudfront/sign"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	awss3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3Adapter implements ObjectStorage against any S3-compatible backend.
type S3Adapter struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
}

func NewS3Adapter(client *s3.Client, bucket string) *S3Adapter {
	return &S3Adapter{
		client:    client,
		presigner: s3.NewPresignClient(client),
		bucket:    bucket,
	}
}

func (a *S3Adapter) PutObject(ctx context.Context, key string, data []byte, contentType string) error {
	reader := bytes.NewReader(data)
	contentLength := int64(len(data))

	input := &s3.PutObjectInput{
		Bucket:        aws.String(a.bucket),
		Key:           aws.String(key),
		Body:          reader,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(contentLength),
	}

	// Apply Cache-Control based on object type
	if strings.HasSuffix(key, ".m3u8") {
		input.CacheControl = aws.String("no-cache")
	} else if strings.HasSuffix(key, ".ts") || strings.HasSuffix(key, ".mp4") || strings.HasSuffix(key, ".jpg") || strings.HasSuffix(key, ".png") {
		input.CacheControl = aws.String("public, max-age=31536000, immutable")
	}

	// Disable automatic checksum calculation which forces aws-chunked transfer encoding.
	// Backblaze B2 does not support aws-chunked and rejects requests with
	// "x-amz-decoded-content-length" header. Setting WhenRequired disables this.
	_, err := a.client.PutObject(ctx, input, func(o *s3.Options) {
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
	})
	return err
}

// PutObjectStream streams data from r directly to S3 using the manager.Uploader
// which handles chunking and buffering internally, avoiding seekability issues.
// contentLength is kept for signature but manager uses Body.
func (a *S3Adapter) PutObjectStream(ctx context.Context, key string, r io.Reader, contentLength int64, contentType string) error {
	uploader := manager.NewUploader(a.client, func(u *manager.Uploader) {
		u.PartSize = 5 * 1024 * 1024 // 5 MB part size
		u.ClientOptions = append(u.ClientOptions, func(o *s3.Options) {
			o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		})
	})

	input := &s3.PutObjectInput{
		Bucket:      aws.String(a.bucket),
		Key:         aws.String(key),
		Body:        r,
		ContentType: aws.String(contentType),
	}

	if strings.HasSuffix(key, ".m3u8") {
		input.CacheControl = aws.String("no-cache")
	} else if strings.HasSuffix(key, ".ts") || strings.HasSuffix(key, ".mp4") || strings.HasSuffix(key, ".jpg") || strings.HasSuffix(key, ".png") {
		input.CacheControl = aws.String("public, max-age=31536000, immutable")
	}

	_, err := uploader.Upload(ctx, input)
	return err
}

func (a *S3Adapter) GetObjectStream(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := a.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(key),
	}, func(o *s3.Options) {
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

func (a *S3Adapter) GetObject(ctx context.Context, key string) ([]byte, error) {
	body, err := a.GetObjectStream(ctx, key)
	if err != nil {
		return nil, err
	}
	defer body.Close()
	return io.ReadAll(body)
}

func (a *S3Adapter) DeleteObject(ctx context.Context, key string) error {
	_, err := a.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (a *S3Adapter) GetPresignedURL(ctx context.Context, key string) (string, error) {
	req, err := a.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (a *S3Adapter) GetPresignedUploadURL(ctx context.Context, key, contentType string) (string, error) {
	req, err := a.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(a.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (a *S3Adapter) GetCloudFrontSignedURL(ctx context.Context, domain, key, keyID, privateKeyPEM string, ttl time.Duration) (string, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return "", fmt.Errorf("failed to decode PEM block containing private key")
	}
	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		parsedKey, err8 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err8 == nil {
			if rsaKey, ok := parsedKey.(*rsa.PrivateKey); ok {
				privKey = rsaKey
			}
		}
		if privKey == nil {
			return "", fmt.Errorf("failed to parse private key: %w", err)
		}
	}

	signer := sign.NewURLSigner(keyID, privKey)
	rawURL := fmt.Sprintf("https://%s/%s", domain, key)

	signedURL, err := signer.Sign(rawURL, time.Now().Add(ttl))
	if err != nil {
		return "", fmt.Errorf("failed to sign CloudFront URL: %w", err)
	}

	return signedURL, nil
}

func (a *S3Adapter) GetCloudFrontSignedCookies(ctx context.Context, domain, prefix, keyID, privateKeyPEM string, ttl time.Duration) (map[string]string, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block containing private key")
	}
	privKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		parsedKey, err8 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err8 == nil {
			if rsaKey, ok := parsedKey.(*rsa.PrivateKey); ok {
				privKey = rsaKey
			}
		}
		if privKey == nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}
	}

	signer := sign.NewCookieSigner(keyID, privKey)
	
	// Create a custom policy for the prefix (supports wildcards)
	resourceURL := fmt.Sprintf("https://%s/%s", domain, prefix)
	policy := &sign.Policy{
		Statements: []sign.Statement{
			{
				Resource: resourceURL,
				Condition: sign.Condition{
					DateLessThan: sign.NewAWSEpochTime(time.Now().Add(ttl)),
				},
			},
		},
	}

	cookies, err := signer.SignWithPolicy(policy)
	if err != nil {
		return nil, fmt.Errorf("failed to sign CloudFront cookies: %w", err)
	}

	cookieMap := make(map[string]string)
	for _, c := range cookies {
		cookieMap[c.Name] = c.Value
	}
	
	return cookieMap, nil
}

func (a *S3Adapter) StatObject(ctx context.Context, key string) (int64, error) {
	out, err := a.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return 0, err
	}
	if out.ContentLength == nil {
		return 0, nil
	}
	return *out.ContentLength, nil
}

// CheckACL verifies required bucket permissions exist (call at startup).
func (a *S3Adapter) CheckACL(ctx context.Context) error {
	_, err := a.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(a.bucket),
	})
	if err != nil {
		return fmt.Errorf("storage: cannot access bucket %q: %w", a.bucket, err)
	}
	return nil
}

func (a *S3Adapter) CreateMultipartUpload(ctx context.Context, key, contentType string) (string, error) {
	out, err := a.client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(a.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", err
	}
	return *out.UploadId, nil
}

func (a *S3Adapter) GetPresignedUploadPartURL(ctx context.Context, key, uploadID string, partNumber int) (string, error) {
	req, err := a.presigner.PresignUploadPart(ctx, &s3.UploadPartInput{
		Bucket:     aws.String(a.bucket),
		Key:        aws.String(key),
		UploadId:   aws.String(uploadID),
		PartNumber: aws.Int32(int32(partNumber)),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}

func (a *S3Adapter) UploadPart(ctx context.Context, key, uploadID string, partNumber int, data []byte) (Part, error) {
	out, err := a.client.UploadPart(ctx, &s3.UploadPartInput{
		Bucket:     aws.String(a.bucket),
		Key:        aws.String(key),
		UploadId:   aws.String(uploadID),
		PartNumber: aws.Int32(int32(partNumber)),
		Body:       bytes.NewReader(data),
	}, func(o *s3.Options) {
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
	})
	if err != nil {
		return Part{}, err
	}
	return Part{
		PartNumber: partNumber,
		ETag:       *out.ETag,
	}, nil
}

func (a *S3Adapter) CompleteMultipartUpload(ctx context.Context, key, uploadID string, parts []Part) error {
	var completedParts []awss3types.CompletedPart
	for _, p := range parts {
		completedParts = append(completedParts, awss3types.CompletedPart{
			ETag:       aws.String(p.ETag),
			PartNumber: aws.Int32(int32(p.PartNumber)),
		})
	}
	_, err := a.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(a.bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &awss3types.CompletedMultipartUpload{
			Parts: completedParts,
		},
	})
	return err
}

func (a *S3Adapter) AbortMultipartUpload(ctx context.Context, key, uploadID string) error {
	_, err := a.client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(a.bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	return err
}

func (a *S3Adapter) DeleteObjects(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}
	var objects []awss3types.ObjectIdentifier
	for _, key := range keys {
		objects = append(objects, awss3types.ObjectIdentifier{
			Key: aws.String(key),
		})
	}
	_, err := a.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(a.bucket),
		Delete: &awss3types.Delete{
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	})
	return err
}

// Ensure S3Adapter implements ObjectStorage at compile time.
var _ ObjectStorage = (*S3Adapter)(nil)

// keep awss3types imported (used for compile-time check guard)
var _ = awss3types.Object{}
