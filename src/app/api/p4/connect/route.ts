import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Create a temporary P4CONFIG file for authentication
 */
function createP4ConfigFile(config: { port: string, user: string, password: string, client?: string }) {
  try {
    // Create temp directory for p4 config if it doesn't exist
    const tmpDir = path.join(os.tmpdir(), 'perforce-friend');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Create or overwrite p4 config file
    const configPath = path.join(tmpDir, 'p4config');
    let configContent = `P4PORT=${config.port}\nP4USER=${config.user}\nP4PASSWD=${config.password}`;
    
    if (config.client) {
      configContent += `\nP4CLIENT=${config.client}`;
    }
    
    fs.writeFileSync(configPath, configContent);
    
    return configPath;
  } catch (error) {
    console.error('Error creating P4CONFIG file:', error);
    throw new Error('Failed to create P4CONFIG file');
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { port, user, password, client } = body;
    
    // Validate required fields
    if (!port || !user || !password) {
      return NextResponse.json(
        { error: 'Missing required Perforce connection parameters' },
        { status: 400 }
      );
    }

    // Create temporary P4CONFIG file
    const configPath = createP4ConfigFile({ port, user, password, client });
    
    try {
      // Test the connection by running p4 info
      const output = execSync(`P4CONFIG=${configPath} p4 info`, { 
        encoding: 'utf8',
        env: {
          ...process.env,
          P4CONFIG: configPath
        }
      });
      
      // Extract server information
      const serverInfo: Record<string, string> = {};
      output.split('\n').forEach(line => {
        const match = line.match(/^([^:]+):\s(.+)$/);
        if (match) {
          serverInfo[match[1]] = match[2];
        }
      });
      
      // Return success with server information
      return NextResponse.json({
        success: true,
        message: 'Connected to Perforce',
        server: port,
        user: user,
        client: client || serverInfo['Client name'] || 'Not specified',
        serverInfo
      });
    } catch (cmdError: any) {
      console.error('P4 command failed:', cmdError.message);
      // Extract meaningful error message
      const errorMessage = cmdError.message.includes('stdout:') 
        ? cmdError.message.split('stdout:')[1].trim() 
        : cmdError.message;
        
      return NextResponse.json(
        { error: `Failed to connect to Perforce: ${errorMessage}` },
        { status: 500 }
      );
    } finally {
      // Clean up by removing the config file
      try {
        fs.unlinkSync(configPath);
      } catch (cleanupError) {
        console.error('Failed to clean up P4CONFIG file:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Error connecting to Perforce:', error);
    return NextResponse.json(
      { error: 'Failed to connect to Perforce server', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 