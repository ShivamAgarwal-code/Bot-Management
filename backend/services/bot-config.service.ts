import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotConfig } from '../entities/bot-config.entity';
import { BotConfigDto } from '../dto/bot-config.dto';


@Injectable()
export class BotConfigService {
  private readonly logger = new Logger(BotConfigService.name);

  constructor(
    @InjectRepository(BotConfig)
    private configRepository: Repository<BotConfig>,
  ) {}

  async getConfig(): Promise<BotConfig> {
    let config = await this.configRepository.findOne({ 
      where: { isActive: true },
      order: { createdAt: 'DESC' }
    });

    if (!config) {
      config = new BotConfig();
      config = await this.configRepository.save(config);
    }

    return config;
  }

  async updateConfig(configDto: BotConfigDto): Promise<BotConfig> {
    let config = await this.getConfig();
    
    // Update only provided fields
    Object.keys(configDto).forEach(key => {
      if (configDto[key] !== undefined) {
        config[key] = configDto[key];
      }
    });

    return await this.configRepository.save(config);
  }

  async updateStatus(status: 'stopped' | 'running' | 'paused'): Promise<BotConfig> {
    const config = await this.getConfig();
    config.status = status;
    
    this.logger.log(`Bot status changed to: ${status}`);
    
    return await this.configRepository.save(config);
  }
}