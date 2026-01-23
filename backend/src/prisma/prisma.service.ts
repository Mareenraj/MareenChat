import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {PrismaClient} from '@prisma/client';
import {Pool} from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly pool: Pool;

    constructor(private readonly config: ConfigService) {
        const connectionString = config.get<string>('DATABASE_URL');
        if (!connectionString) {
            throw new Error('DATABASE_URL is not set');
        }

        const pool = new Pool({connectionString});
        const adapter = new PrismaPg(pool);

        super({
            adapter,
            log: ['warn', 'error'],
        });

        this.pool = pool;
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
        await this.pool.end();
    }
}
