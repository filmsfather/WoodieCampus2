import type { Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { PrismaClient } from "@prisma/client"
import { logger } from '../config/logger.js';
import { authenticateToken, requireAnyRole } from '../middleware/standard-auth.js';
import type { ApiRequest } from '../types/api.js';

const router = Router();
const prisma = new PrismaClient();

// 업로드 디렉토리 설정
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB 기본값

// 업로드 디렉토리 생성 확인
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'images'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'documents'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'temp'), { recursive: true });
  }
}

// Multer 설정
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureUploadDir();
    
    let subfolder = 'documents';
    if (file.mimetype.startsWith('image/')) {
      subfolder = 'images';
    }
    
    cb(null, path.join(UPLOAD_DIR, subfolder));
  },
  filename: (req, file, cb) => {
    // 안전한 파일명 생성
    const hash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${hash}${ext}`;
    cb(null, filename);
  },
});

// 파일 타입 필터
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    // 이미지
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // 문서
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    // 기타
    'application/json',
    'application/xml',
    'text/xml',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10, // 최대 10개 파일
  },
});

// 단일 파일 업로드 (POST /media/upload)
router.post('/upload', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), upload.single('file'), async (req: ApiRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No file uploaded',
      });
    }

    const { description, problemId, problemSetId } = req.body;
    
    // 파일 정보 생성
    const fileUrl = `/api/media/files/${path.basename(req.file.filename)}`;
    const relativePath = path.relative(process.cwd(), req.file.path);

    // 파일 메타데이터 저장 (향후 확장을 위해)
    const fileRecord = {
      id: crypto.randomUUID(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: relativePath,
      url: fileUrl,
      uploadedBy: req.user!.userId,
      description: description || null,
      problemId: problemId || null,
      problemSetId: problemSetId || null,
      createdAt: new Date(),
    };

    res.status(201).json({
      id: fileRecord.id,
      url: fileUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedAt: fileRecord.createdAt,
    });

    logger.info(`File uploaded by user ${req.user?.userId}`, {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });

  } catch (error) {
    logger.error('Error uploading file:', error);
    
    // 업로드 실패시 파일 삭제 시도
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Error removing failed upload:', unlinkError);
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload file',
    });
  }
});

// 다중 파일 업로드 (POST /media/upload/multiple)
router.post('/upload/multiple', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), upload.array('files', 10), async (req: ApiRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'No files uploaded',
      });
    }

    const { description, problemId, problemSetId } = req.body;
    
    const uploadedFiles = files.map((file) => {
      const fileUrl = `/api/media/files/${path.basename(file.filename)}`;
      const relativePath = path.relative(process.cwd(), file.path);

      return {
        id: crypto.randomUUID(),
        url: fileUrl,
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: relativePath,
        uploadedAt: new Date(),
      };
    });

    res.status(201).json({
      files: uploadedFiles,
      count: uploadedFiles.length,
    });

    logger.info(`${files.length} files uploaded by user ${req.user?.userId}`, {
      filenames: files.map(f => f.filename),
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    });

  } catch (error) {
    logger.error('Error uploading multiple files:', error);
    
    // 업로드 실패시 파일들 삭제 시도
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          logger.error(`Error removing failed upload ${file.filename}:`, unlinkError);
        }
      }
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload files',
    });
  }
});

// 파일 제공 (GET /media/files/:filename)
router.get('/files/:filename', async (req: ApiRequest, res: Response) => {
  try {
    const { filename } = req.params;
    
    // 파일명 보안 검사
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid filename',
      });
    }

    // 파일 경로 확인
    let filePath = '';
    const imagePath = path.join(UPLOAD_DIR, 'images', filename);
    const documentPath = path.join(UPLOAD_DIR, 'documents', filename);

    try {
      await fs.access(imagePath);
      filePath = imagePath;
    } catch {
      try {
        await fs.access(documentPath);
        filePath = documentPath;
      } catch {
        return res.status(404).json({
          error: 'Not found',
          message: 'File not found',
        });
      }
    }

    // 파일 정보 조회
    const stats = await fs.stat(filePath);
    
    // 파일 타입에 따른 Content-Type 설정
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.json': 'application/json',
    };
    
    if (mimeTypes[ext]) {
      contentType = mimeTypes[ext];
    }

    // 캐시 헤더 설정
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1년
    res.setHeader('ETag', `"${stats.mtime.getTime()}"`);

    // If-None-Match 헤더 확인 (304 처리)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === `"${stats.mtime.getTime()}"`) {
      return res.status(304).end();
    }

    // 파일 스트리밍
    const fileBuffer = await fs.readFile(filePath);
    res.send(fileBuffer);

  } catch (error) {
    logger.error('Error serving file:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to serve file',
    });
  }
});

// 이미지 리사이징 (GET /media/images/:filename/resize)
router.get('/images/:filename/resize', async (req: ApiRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const { width, height, quality = '80' } = req.query;
    
    // 파일명 보안 검사
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid filename',
      });
    }

    const imagePath = path.join(UPLOAD_DIR, 'images', filename);
    
    try {
      await fs.access(imagePath);
    } catch {
      return res.status(404).json({
        error: 'Not found',
        message: 'Image not found',
      });
    }

    // 간단한 이미지 정보 반환 (실제 리사이징은 프론트엔드나 CDN에서 처리)
    const stats = await fs.stat(imagePath);
    const originalUrl = `/api/media/files/${filename}`;
    
    res.json({
      originalUrl,
      resizeOptions: {
        width: width ? parseInt(width as string) : null,
        height: height ? parseInt(height as string) : null,
        quality: parseInt(quality as string),
      },
      size: stats.size,
      lastModified: stats.mtime,
      // 실제 환경에서는 이미지 처리 라이브러리 (sharp, jimp 등) 사용
      message: 'Resize functionality requires image processing library',
    });

  } catch (error) {
    logger.error('Error processing image resize request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process image resize request',
    });
  }
});

// 파일 삭제 (DELETE /media/files/:filename)
router.delete('/files/:filename', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { filename } = req.params;
    
    // 파일명 보안 검사
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid filename',
      });
    }

    // 파일 경로 확인
    let filePath = '';
    const imagePath = path.join(UPLOAD_DIR, 'images', filename);
    const documentPath = path.join(UPLOAD_DIR, 'documents', filename);

    try {
      await fs.access(imagePath);
      filePath = imagePath;
    } catch {
      try {
        await fs.access(documentPath);
        filePath = documentPath;
      } catch {
        return res.status(404).json({
          error: 'Not found',
          message: 'File not found',
        });
      }
    }

    // 파일 삭제
    await fs.unlink(filePath);

    res.status(204).send();

    logger.info(`File deleted by user ${req.user?.userId}`, {
      filename,
      path: filePath,
    });

  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete file',
    });
  }
});

// LaTeX 수식 렌더링 미리보기 (POST /media/latex/preview)
router.post('/latex/preview', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { latex } = req.body;
    
    if (!latex || typeof latex !== 'string') {
      return res.status(400).json({
        error: 'Bad request',
        message: 'LaTeX string is required',
      });
    }

    // LaTeX 유효성 검사 (기본적인 보안 검사)
    const dangerousPatterns = [
      /\\input/,
      /\\include/,
      /\\write/,
      /\\openout/,
      /\\read/,
      /\\openin/,
      /\\catcode/,
      /\\def/,
      /\\let/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(latex)) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'LaTeX contains forbidden commands',
        });
      }
    }

    // 간단한 LaTeX 문법 검사
    const bracketPairs = [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ];

    for (const [open, close] of bracketPairs) {
      const openCount = (latex.match(new RegExp('\\' + open, 'g')) || []).length;
      const closeCount = (latex.match(new RegExp('\\' + close, 'g')) || []).length;
      
      if (openCount !== closeCount) {
        return res.status(400).json({
          error: 'Bad request',
          message: `Mismatched ${open}${close} brackets in LaTeX`,
        });
      }
    }

    // LaTeX 미리보기 정보 반환
    // 실제 환경에서는 KaTeX나 MathJax 서버 렌더링 사용
    res.json({
      latex,
      isValid: true,
      preview: {
        html: `<span class="katex-preview">${latex}</span>`,
        warnings: [],
      },
      // 실제 렌더링을 위한 설정
      katexOptions: {
        displayMode: latex.includes('\\begin{') || latex.includes('\\['),
        throwOnError: false,
        errorColor: '#cc0000',
      },
    });

    logger.info(`LaTeX preview requested by user ${req.user?.userId}`, {
      latexLength: latex.length,
    });

  } catch (error) {
    logger.error('Error processing LaTeX preview:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process LaTeX preview',
    });
  }
});

// 자동 저장을 위한 임시 저장 (POST /media/autosave)
router.post('/autosave', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { type, id, content, metadata } = req.body;
    
    if (!type || !content) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Type and content are required',
      });
    }

    // 자동 저장 키 생성
    const autosaveKey = `autosave:${type}:${id || 'new'}:${req.user!.userId}`;
    
    const autosaveData = {
      type,
      id,
      content,
      metadata,
      userId: req.user!.userId,
      savedAt: new Date().toISOString(),
    };

    // Redis에 자동 저장 (실제 환경에서는 Redis 사용)
    // 여기서는 간단한 로깅으로 대체
    logger.info(`Autosave for ${type} by user ${req.user?.userId}`, {
      key: autosaveKey,
      contentLength: typeof content === 'string' ? content.length : 0,
    });

    res.json({
      success: true,
      savedAt: autosaveData.savedAt,
      key: autosaveKey,
    });

  } catch (error) {
    logger.error('Error processing autosave:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to autosave content',
    });
  }
});

// 자동 저장된 내용 조회 (GET /media/autosave/:type/:id)
router.get('/autosave/:type/:id', authenticateToken, requireAnyRole(['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req: ApiRequest, res: Response) => {
  try {
    const { type, id } = req.params;
    
    const autosaveKey = `autosave:${type}:${id}:${req.user!.userId}`;
    
    // 실제 환경에서는 Redis에서 데이터 조회
    // 여기서는 기본적인 응답 구조만 제공
    res.json({
      key: autosaveKey,
      found: false,
      data: null,
      message: 'Autosave retrieval requires Redis implementation',
    });

  } catch (error) {
    logger.error('Error retrieving autosave:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve autosave content',
    });
  }
});

// 업로드된 파일 목록 조회 (GET /media/files)
router.get('/files', authenticateToken, async (req: ApiRequest, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type, // 'image' 또는 'document'
      problemId,
      problemSetId 
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    // 실제 환경에서는 데이터베이스에서 파일 메타데이터 조회
    // 여기서는 파일 시스템을 직접 스캔
    const imageFiles = [];
    const documentFiles = [];

    try {
      const imageDir = path.join(UPLOAD_DIR, 'images');
      const docDir = path.join(UPLOAD_DIR, 'documents');

      // 이미지 파일 조회
      try {
        const imageFileNames = await fs.readdir(imageDir);
        for (const filename of imageFileNames) {
          const filePath = path.join(imageDir, filename);
          const stats = await fs.stat(filePath);
          imageFiles.push({
            filename,
            url: `/api/media/files/${filename}`,
            type: 'image',
            size: stats.size,
            createdAt: stats.ctime,
          });
        }
      } catch {
        // 이미지 디렉토리가 없는 경우 무시
      }

      // 문서 파일 조회
      try {
        const docFileNames = await fs.readdir(docDir);
        for (const filename of docFileNames) {
          const filePath = path.join(docDir, filename);
          const stats = await fs.stat(filePath);
          documentFiles.push({
            filename,
            url: `/api/media/files/${filename}`,
            type: 'document', 
            size: stats.size,
            createdAt: stats.ctime,
          });
        }
      } catch {
        // 문서 디렉토리가 없는 경우 무시
      }
    } catch (error) {
      logger.error('Error reading upload directories:', error);
    }

    let allFiles = [...imageFiles, ...documentFiles];

    // 타입 필터링
    if (type === 'image') {
      allFiles = imageFiles;
    } else if (type === 'document') {
      allFiles = documentFiles;
    }

    // 정렬 (최신순)
    allFiles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 페이지네이션
    const total = allFiles.length;
    const startIndex = (pageNum - 1) * limitNum;
    const files = allFiles.slice(startIndex, startIndex + limitNum);

    res.json({
      files,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });

  } catch (error) {
    logger.error('Error fetching file list:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch file list',
    });
  }
});

export default router;