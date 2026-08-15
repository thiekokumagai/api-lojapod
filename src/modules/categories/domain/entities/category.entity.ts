export interface Category {
  id: string;
  title: string;
  image: string | null;
  isVisible: boolean;
  excludeFromBestSeller: boolean;
  order: number;
  deletedAt: Date | null;
}
