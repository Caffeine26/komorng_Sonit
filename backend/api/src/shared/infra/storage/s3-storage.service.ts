import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly logger = new Logger(S3StorageService.name);

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('STORAGE_BUCKET', 'xfos-media');
    this.publicUrl = this.config.get<string>('STORAGE_PUBLIC_URL', 'http://localhost:9000/xfos-media');

    this.client = new S3Client({
      endpoint: this.config.get<string>('STORAGE_ENDPOINT', 'http://localhost:9000'),
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get<string>('STORAGE_ACCESS_KEY', 'xfos_admin'),
        secretAccessKey: this.config.get<string>('STORAGE_SECRET_KEY', 'xfos_password'),
      },
      forcePathStyle: true,
    });
  }

  async upload(file: Express.Multer.File, folder: string = 'uploads'): Promise<string> {
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${file.originalname.substring(file.originalname.lastIndexOf('.'))}`;
    const key = `${folder}/${fileName}`;

    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read',
        },
      });

      await upload.done();
      return `${this.publicUrl}/${key}`;
    } catch (err) {
      this.logger.error(`[S3Upload] Failed to upload ${key}:`, err);
      throw err;
    }
  }
}
