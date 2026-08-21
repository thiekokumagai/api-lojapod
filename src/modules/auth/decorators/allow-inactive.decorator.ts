import { SetMetadata } from '@nestjs/common';

export const IS_ALLOW_INACTIVE_KEY = 'isAllowInactive';
export const AllowInactive = () => SetMetadata(IS_ALLOW_INACTIVE_KEY, true);
