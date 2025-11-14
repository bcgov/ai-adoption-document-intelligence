import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceConfig: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ai_ocr',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/**/*{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production', // Only in development
  logging: process.env.NODE_ENV === 'development',
};

const dataSource = new DataSource(dataSourceConfig);
export default dataSource;

