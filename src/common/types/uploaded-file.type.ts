export type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
  customName?: string;
};
