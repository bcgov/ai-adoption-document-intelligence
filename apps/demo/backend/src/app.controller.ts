import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AppService } from './app.service';
import { PlaygroundService } from './playground.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly playgroundService: PlaygroundService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('playground')
  getPlayground(@Res() res: FastifyReply) {
    const port = process.env.PORT || 3000;
    const graphqlEndpoint = `http://localhost:${port}/graphql`;
    const playgroundHTML = this.playgroundService.generatePlaygroundHTML(graphqlEndpoint);
    
    res.type('text/html');
    res.send(playgroundHTML);
  }
}

