import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IProductsRepository } from '../repositories/iproducts.repository';

@Injectable()
export class ManageProductImagesUseCase {
  constructor(private readonly productsRepository: IProductsRepository) {}

  async addImages(productId: string, urls: string[]) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    await this.productsRepository.addImages(productId, urls);
    return this.productsRepository.findById(productId);
  }

  /** Define a nova ordem das imagens. A primeira passa a ser a principal. */
  async reorderImages(productId: string, imageIds: string[]) {
    const product: any = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const currentIds: string[] = (product.images || []).map((img: any) => img.id);
    const requested = Array.from(new Set(imageIds || []));
    const sameSet =
      requested.length === currentIds.length && requested.every((id) => currentIds.includes(id));
    if (!sameSet) {
      throw new BadRequestException('A lista de imagens não corresponde às imagens do produto.');
    }

    await this.productsRepository.reorderImages(productId, requested);
    return this.productsRepository.findById(productId);
  }

  async removeImage(productId: string, imageId: string) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const image = await this.productsRepository.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Imagem não encontrada');
    }

    await this.productsRepository.removeImage(imageId);

    const usageCount = await this.productsRepository.countImagesByUrl(image.url);

    return {
      image,
      canDeleteOldUrl: usageCount === 0
    };
  }

  async replaceImage(productId: string, imageId: string, newUrl: string) {
    const product = await this.productsRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const image = await this.productsRepository.findImageById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Imagem não encontrada');
    }

    await this.productsRepository.replaceImage(imageId, newUrl);
    
    const usageCount = await this.productsRepository.countImagesByUrl(image.url);

    return {
      product: await this.productsRepository.findById(productId),
      oldUrl: image.url,
      canDeleteOldUrl: usageCount === 0
    };
  }
}
