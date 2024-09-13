import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { FileData } from '@ffmpeg/ffmpeg/dist/esm/types';


const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  private videoCanvas: HTMLCanvasElement | undefined;
  private ctx!: CanvasRenderingContext2D;
  width = 640;  // Width of the video
  height = 380; // Height of the video
  private frameSize = this.width * this.height * 4; // RGBA frame size
  private frameRate = 30; // Default frame rate (30 FPS)
  private ffmpeg = new FFmpeg();
  private frameDataArray: Uint8Array[] = [];
  loaded = false;
  playing = false;
  rgbaBlobUrl: string | null = null; // URL for downloading RGBA file

  videoURL = "http://localhost:4200/assets/h265-640x480-30FPS-50GOP-512Kbps-aac-16Khz-32Kbps.mp4";
  // videoURL = "http://localhost:4200/assets/mjpeg-704x576-25FPS-50GOP-1024Kbps-aac-16Khz-32Kbps.mp4";

  ngOnInit() {
    this.setupCanvas();
    this.initializeFFmpeg();
  }

  private async initializeFFmpeg() {
    console.log("initializeFFmpeg");
    this.ffmpeg.on("log", ({ message }) => console.log(message));

    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
      classWorkerURL: 'http://localhost:4200/assets/ffmpeg/worker.js'
    });

    this.loaded = true;
    console.log("FFmpeg loaded:", this.loaded);
  }

  async decodeVideo() {
    if (!this.loaded) return console.error("FFmpeg is not loaded yet.");

    try {
      await this.ffmpeg.load();
      await this.ffmpeg.writeFile("input.mp4", await fetchFile(this.videoURL));
      console.log("Video file written to FFmpeg virtual filesystem.");

      // Execute FFmpeg command to convert video to raw RGBA format
      await this.ffmpeg.exec([
        '-ss', '00:00:00',                  // Start time
        '-i', 'input.mp4',                  // Input file
        '-t', '00:00:30',                   // Duration (30 seconds)
        '-s', `${this.width}x${this.height}`,    // Output width and height
        '-f', 'rawvideo',                   // Output format: raw video
        '-pix_fmt', 'rgba',                 // Pixel format: RGBA
        'output.rgba',                      // Output file
        '-nostdin', '-y',
      ]);

      console.log("Raw RGBA data extraction completed.");
      const fileData: FileData = await this.ffmpeg.readFile('output.rgba');

      if (fileData) {
        const frameData = new Uint8Array(fileData as Uint8Array);
        this.prepareFrames(frameData);
        this.createDownloadLink(fileData);
      }
    } catch (error) {
      console.error("Error decoding video:", error);
    }
  }

  private prepareFrames(frameData: Uint8Array) {
    const frameCount = Math.floor(frameData.length / this.frameSize);
    console.log(`Total Frames: ${frameCount}`);

    for (let i = 0; i < frameCount; i++) {
      // console.log("frameCount : " + i);
      const frameStart = i * this.frameSize;
      const frameEnd = frameStart + this.frameSize;
      const frameSlice = frameData.slice(frameStart, frameEnd);
      this.frameDataArray.push(frameSlice);
    }

    this.playing = true;
    this.renderVideoFrames();
  }

  private renderVideoFrames() {
    let currentFrame = 0;
    const frameInterval = 1000 / this.frameRate; // Time per frame in milliseconds
    const startTime = Date.now(); // Record the start time
    let isLogged = false; // Ensure logging only happens once

    const renderFrame = () => {
      if (!this.playing || currentFrame >= this.frameDataArray.length) {
        // Log the time difference when the last frame is rendered
        if (!isLogged) {
          const endTime = Date.now();
          const totalTime = (endTime - startTime) / 1000; // Convert milliseconds to seconds
          console.log(`Total rendering time: ${totalTime} seconds`);
          isLogged = true; // Set to true to prevent further logging
        }
        return; // Stop if not playing or out of frames
      }

      const imageData = new ImageData(
        new Uint8ClampedArray(this.frameDataArray[currentFrame]),
        this.width,
        this.height
      );
      this.ctx.putImageData(imageData, 0, 0);

      currentFrame++;
    };

    // Use setInterval to maintain a consistent frame rate
    const intervalId = setInterval(() => {
      if (!this.playing) {
        clearInterval(intervalId);
        return;
      }
      renderFrame();
    }, frameInterval);
  }

  private setupCanvas() {
    this.videoCanvas = document.getElementById('videoCanvas') as HTMLCanvasElement;
    this.ctx = this.videoCanvas.getContext('2d')!;
    this.videoCanvas.width = this.width;
    this.videoCanvas.height = this.height;
  }

  private createDownloadLink(data: FileData) {
    // Convert data to Blob and create download URL
    const blob = new Blob([data], { type: 'application/octet-stream' });
    this.rgbaBlobUrl = URL.createObjectURL(blob);
  }

  downloadRGBA() {
    if (this.rgbaBlobUrl) {
      const a = document.createElement('a');
      a.href = this.rgbaBlobUrl;
      a.download = 'output.rgba';
      a.click();
    }
  }

  togglePlayback() {
    this.playing = !this.playing;
    if (this.playing) {
      this.decodeVideo();
    }
  }
}
