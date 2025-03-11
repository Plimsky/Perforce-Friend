import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';

/**
 * Opens a file in the default system editor
 */
export async function POST(req: Request) {
  try {
    const { filePath } = await req.json();
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'No file path provided' },
        { status: 400 }
      );
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return NextResponse.json(
        { error: `File does not exist or is not accessible: ${filePath}` },
        { status: 404 }
      );
    }

    // Determine command based on operating system
    let command: string;
    const platform = os.platform();
    
    if (platform === 'win32') {
      // Windows
      command = `start "" "${filePath}"`;
    } else if (platform === 'darwin') {
      // macOS
      command = `open "${filePath}"`;
    } else {
      // Linux and others
      command = `xdg-open "${filePath}"`;
    }

    // Execute the command to open the file
    exec(command, (error) => {
      if (error) {
        console.error(`Error opening file: ${error.message}`);
      }
    });

    return NextResponse.json({
      success: true,
      message: `Opening file: ${filePath}`
    });
  } catch (error) {
    console.error('Error opening file:', error);
    return NextResponse.json(
      { error: 'Failed to open file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 