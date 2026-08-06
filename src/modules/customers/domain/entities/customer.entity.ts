export class CustomerAddress {
  id: string;
  customerId: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  complement?: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<CustomerAddress>) {
    Object.assign(this, data);
  }
}

export class Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
  addresses?: CustomerAddress[];
  orders?: any[];

  constructor(data: Partial<Customer>) {
    Object.assign(this, data);
  }
}
