import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { ListCustomersUseCase } from '../../domain/use-cases/list-customers.use-case';
import { GetCustomerUseCase } from '../../domain/use-cases/get-customer.use-case';
import { UpdateCustomerUseCase } from '../../domain/use-cases/update-customer.use-case';
import { UpdateCustomerDto } from '../dtos/update-customer.dto';
import { CreateCustomerAddressDto } from '../dtos/create-customer-address.dto';
import { AddCustomerAddressUseCase } from '../../domain/use-cases/add-customer-address.use-case';
import { CreateCustomerUseCase } from '../../domain/use-cases/create-customer.use-case';
import { CreateCustomerDto } from '../dtos/create-customer.dto';
import { UpdateCustomerAddressDto } from '../dtos/update-customer-address.dto';
import { UpdateCustomerAddressUseCase } from '../../domain/use-cases/update-customer-address.use-case';

@ApiTags('customers')
@Controller('customers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly listCustomersUseCase: ListCustomersUseCase,
    private readonly getCustomerUseCase: GetCustomerUseCase,
    private readonly updateCustomerUseCase: UpdateCustomerUseCase,
    private readonly addCustomerAddressUseCase: AddCustomerAddressUseCase,
    private readonly createCustomerUseCase: CreateCustomerUseCase,
    private readonly updateCustomerAddressUseCase: UpdateCustomerAddressUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar clientes',
    description: 'Retorna a lista de clientes com paginação e filtros',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de clientes retornada com sucesso.',
  })
  async list(@Query() filters: any) {
    return this.listCustomersUseCase.execute(filters);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Buscar cliente por ID',
    description: 'Retorna os detalhes de um cliente específico',
  })
  @ApiResponse({ status: 200, description: 'Cliente encontrado com sucesso.' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado.' })
  async getById(@Param('id') id: string) {
    return this.getCustomerUseCase.execute(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Atualizar cliente',
    description: 'Atualiza as informações básicas do cliente (nome, telefone)',
  })
  @ApiResponse({ status: 200, description: 'Cliente atualizado com sucesso.' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado.' })
  async update(@Param('id') id: string, @Body() data: UpdateCustomerDto) {
    return this.updateCustomerUseCase.execute(id, data);
  }

  @Post()
  @ApiOperation({
    summary: 'Criar cliente',
    description: 'Cria um novo cliente',
  })
  @ApiResponse({ status: 201, description: 'Cliente criado com sucesso.' })
  async create(@Body() data: CreateCustomerDto) {
    return this.createCustomerUseCase.execute(data);
  }

  @Post(':id/addresses')
  @ApiOperation({
    summary: 'Cadastrar endereço',
    description:
      'Adiciona um novo endereço para o cliente. Se isDefault for true, este passa a ser o principal.',
  })
  @ApiResponse({ status: 201, description: 'Endereço cadastrado com sucesso.' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado.' })
  async addAddress(
    @Param('id') id: string,
    @Body() data: CreateCustomerAddressDto,
  ) {
    return this.addCustomerAddressUseCase.execute(id, data);
  }

  @Put(':id/addresses/:addressId')
  @ApiOperation({
    summary: 'Atualizar endereço',
    description: 'Atualiza um endereço existente de um cliente.',
  })
  @ApiResponse({ status: 200, description: 'Endereço atualizado com sucesso.' })
  @ApiResponse({ status: 404, description: 'Cliente ou endereço não encontrado.' })
  async updateAddress(
    @Param('id') customerId: string,
    @Param('addressId') addressId: string,
    @Body() data: UpdateCustomerAddressDto,
  ) {
    return this.updateCustomerAddressUseCase.execute(customerId, addressId, data);
  }
}
