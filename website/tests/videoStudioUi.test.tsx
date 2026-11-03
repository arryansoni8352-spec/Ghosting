import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoStudioPage } from '../src/pages/VideoStudioPage';

// Mock video format detector extractHtml5VideoMetrics
vi.mock('../src/utils/videoFormatDetector', async () => {
  const actual = await vi.importActual('../src/utils/videoFormatDetector');
  return {
    ...actual,
    extractHtml5VideoMetrics: vi.fn(() =>
      Promise.resolve({
        duration: 12.5,
        width: 1920,
        height: 1080,
        videoElement: document.createElement('video'),
        objectUrl: 'blob:mock-video-url',
      })
    ),
  };
});

describe('VideoStudioPage UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial upload dropzone and format tags', () => {
    render(<VideoStudioPage />);

    expect(
      screen.getByText(/Inspect, sanitize & protect your videos locally/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Drop your video here, or click to browse/i)
    ).toBeInTheDocument();
    expect(screen.getByText('.mp4')).toBeInTheDocument();
    expect(screen.getByText('.mov')).toBeInTheDocument();
    expect(screen.getByText('.webm')).toBeInTheDocument();
  });

  it('handles video file selection and opens the studio workspace', async () => {
    render(<VideoStudioPage />);

    // Create mock MP4 file
    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    const file = new File([mp4Bytes], 'beach-holiday.mp4', { type: 'video/mp4' });

    const input = screen.getByLabelText(/Upload video file/i);
    fireEvent.change(input, { target: { files: [file] } });

    // Should display file name
    expect(await screen.findByText('beach-holiday.mp4')).toBeInTheDocument();
    expect(screen.getByText('Change Video')).toBeInTheDocument();
    expect(screen.getByText('Privacy Risk Assessment')).toBeInTheDocument();

    // Studio tabs should be visible
    expect(screen.getByText(/Metadata Inspector & Cleaner/i)).toBeInTheDocument();
    expect(screen.getByText(/Watermark Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Editing & Export/i)).toBeInTheDocument();
  });

  it('switches between tabs and allows watermark configuration', async () => {
    render(<VideoStudioPage />);

    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    const file = new File([mp4Bytes], 'clip.mp4', { type: 'video/mp4' });

    const input = screen.getByLabelText(/Upload video file/i);
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText('clip.mp4');

    // Click Watermark Studio tab
    const watermarkTab = screen.getByText(/Watermark Studio/i);
    fireEvent.click(watermarkTab);

    expect(screen.getByText('Text Watermark')).toBeInTheDocument();
    expect(screen.getByText('Logo Image Watermark')).toBeInTheDocument();

    // Toggle text watermark
    const textCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(textCheckbox);

    expect(screen.getByPlaceholderText(/e\.g\. Copyright/i)).toBeInTheDocument();
    expect(screen.getByText('Insert Copyright Label')).toBeInTheDocument();
  });

  it('switches to editing tab and allows setting crop, rotation, and presets', async () => {
    render(<VideoStudioPage />);

    const mp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    const file = new File([mp4Bytes], 'drone.mp4', { type: 'video/mp4' });

    const input = screen.getByLabelText(/Upload video file/i);
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText('drone.mp4');

    // Click Editing & Export tab
    const editorTab = screen.getByText(/Editing & Export/i);
    fireEvent.click(editorTab);

    expect(screen.getByText('Trim Duration')).toBeInTheDocument();
    expect(screen.getByText('Aspect Ratio / Crop')).toBeInTheDocument();
    expect(screen.getByText('Rotate Video')).toBeInTheDocument();
    expect(screen.getByText('Compression Preset')).toBeInTheDocument();

    // Click 90° rotation button
    const rot90 = screen.getByRole('button', { name: '90°' });
    fireEvent.click(rot90);

    // Click 1:1 crop
    const crop11 = screen.getByRole('button', { name: '1:1' });
    fireEvent.click(crop11);
  });
});
