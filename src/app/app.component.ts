import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { FileData } from '@ffmpeg/ffmpeg/dist/esm/types';
import { FormsModule } from '@angular/forms';
import { TimeLineComponent } from "./time-line/time-line.component";

const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, FormsModule, TimeLineComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  private videoCanvas: HTMLCanvasElement | undefined;
  private ctx!: CanvasRenderingContext2D;
  width = 640;  // Width of the video
  height = 380; // Height of the video
  private frameSize = this.width * this.height * 4; // RGBA frame size
  frameRate = 30; // Default frame rate (30 FPS)
  private ffmpeg = new FFmpeg();
  frameDataArray: Uint8Array[] = [];
  loaded = false;
  playing = false;
  currentFrame = 0;
  rgbaBlobUrl: string | null = null; // URL for downloading RGBA file
  selectedSpeed = 1;
  intervalId: ReturnType<typeof setInterval> | null = null;
  isDecoding = false;

  videoURL = "http://localhost:4200/assets/h265-640x480-30FPS-50GOP-512Kbps-aac-16Khz-32Kbps.mp4";

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
      this.isDecoding = true;
      await this.ffmpeg.load();
      await this.ffmpeg.writeFile("input.mp4", await fetchFile(this.videoURL));
      console.log("Video file written to FFmpeg virtual filesystem.");

      // Execute FFmpeg command to convert video to raw RGBA format
      await this.ffmpeg.exec([
        '-ss', '00:00:00',                  // Start time
        '-i', 'input.mp4',                  // Input file
        '-t', '00:00:20',                   // Duration (30 seconds)
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
    const frameInterval = 1000 / (this.frameRate * this.selectedSpeed); // Time per frame in milliseconds
    const startTime = Date.now(); // Record the start time
    let isLogged = false; // Ensure logging only happens once

    const renderFrame = () => {
      if (!this.playing || this.currentFrame >= this.frameDataArray.length) {
        // Log the time difference when the last frame is rendered
        if (!isLogged) {
          const endTime = Date.now();
          const totalTime = (endTime - startTime) / 1000; // Convert milliseconds to seconds
          console.log(`Total rendering time: ${totalTime} seconds`);
          isLogged = true; // Set to true to prevent further logging
          this.playing = false;
        }
        return; // Stop if not playing or out of frames
      }

      const imageData = new ImageData(
        new Uint8ClampedArray(this.frameDataArray[this.currentFrame]),
        this.width,
        this.height
      );

      // Draw the image data
      this.ctx.putImageData(imageData, 0, 0);

      this.currentFrame++;
    };

    // Clear the previous interval if it exists
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Use setInterval to maintain a consistent frame rate
    this.intervalId = setInterval(() => {
      if (!this.playing) {
        clearInterval(this.intervalId!);
        this.intervalId = null;
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

  togglePlayback(action: string) {
    if (this.playing) {
      // If currently playing, handle stopping
      this.playing = false;
      this.currentFrame = (action === 'stop') ? 0 : this.currentFrame;
    } else {
      // If not playing, start playback or decode if necessary
      if (this.frameDataArray.length > 0) {
        this.currentFrame = (this.currentFrame >= this.frameDataArray.length) ? 0 : this.currentFrame;
        this.renderVideoFrames();
        this.playing = true;
      } else if (!this.isDecoding) {
        this.decodeVideo();
      }
    }
  }

  onTimelineChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.currentFrame = +target.value; // Get the frame from the slider

    // Render the selected frame immediately when the timeline changes
    const imageData = new ImageData(
      new Uint8ClampedArray(this.frameDataArray[this.currentFrame]),
      this.width,
      this.height
    );
    this.ctx.putImageData(imageData, 0, 0);
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`; // MM:SS format
  }

  changePlaybackSpeed(event: Event) {
    const target = event.target as HTMLSelectElement;  // Cast to HTMLSelectElement
    this.selectedSpeed = +target.value;
    if (this.playing) {
      this.playing = false;  // Pause the current playback
      this.renderVideoFrames();  // Re-render with the new speed
      this.playing = true;  // Resume playback
    }
  }

  toggleFullscreen() {
    // const canvasElement = this.videoCanvas.nativeElement;
    if (document.fullscreenElement) {
      // Exit full-screen mode if already in full-screen
      document.exitFullscreen();
    } else {
      // Enter full-screen mode
      if (this.videoCanvas?.requestFullscreen) {
        this.videoCanvas?.requestFullscreen();
        // Optional: Start video playback when entering full-screen
        this.playing = true;
        this.renderVideoFrames();
      }
    }
  }

  moveForward() {
    const framesToSkip = Math.floor(5 * this.frameRate); // Skip 10 seconds worth of frames
    this.currentFrame = Math.min(this.currentFrame + framesToSkip, this.frameDataArray.length - 1);
    this.renderVideoFrames();
  }

  moveBackward() {
    const framesToSkip = Math.floor(5 * this.frameRate); // Skip 10 seconds worth of frames
    this.currentFrame = Math.max(this.currentFrame - framesToSkip, 0);
    this.renderVideoFrames();
  }

}

