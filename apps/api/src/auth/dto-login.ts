import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiPropertyOptional({ example: 'admin or dr.khalidh@akselitedental.com' })
  @IsOptional()
  @IsString()
  emailOrUsername?: string;

  @ApiPropertyOptional({ example: 'admin@akselitedental.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ example: 'Admin@12345' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @IsNotEmpty()
  password: string;
}