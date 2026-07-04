import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { S3StorageService } from '../../../../shared/infra/storage/s3-storage.service';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { TenantAuthGuard } from '../../../../shared/guards/tenant-auth.guard';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('admin/menu/media')
export class AdminMediaController {
    constructor(private readonly storageService: S3StorageService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
    }))
    async uploadFile(@UploadedFile() file: Express.Multer.File) {
        const url = await this.storageService.upload(file, 'catalog');
        return { url };
    }
}
