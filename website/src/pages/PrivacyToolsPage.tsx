import React, { useState, useRef, useEffect } from 'react';
import {
  FileCheck,
  Trash2,
  Download,
  AlertTriangle,
  Check,
  MapPin,
  ExternalLink,
  Lock,
  Copy,
  Info,
  Search,
  Upload,
} from 'lucide-react';
import {
  inspectImageMetadata,
  ImageMetadataReport,
  validateImageFile,
} from '../utils/metadataInspector';
import {
  stripImageMetadata,
  StripMetadataResult,
} from '../utils/metadataStripper';

interface PrivacyToolsPageProps {
  initialFile?: File | null;
  onClearInitialFile?: () => void;
}

export const PrivacyToolsPage: React.FC<PrivacyToolsPageProps> = ({
  initialFile,
  onClearInitialFile,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [report, setReport] = useState<ImageMetadataReport | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isStripping, setIsStripping] = useState(false);
  const [stripResult, setStripResult] = useState<StripMetadataResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeToolTab, setActiveToolTab] = useState<'inspector' | 'cleaner'>('inspector');
  const [targetFormat, setTargetFormat] = useState<'preserve' | 'image/jpeg' | 'image/png' | 'image/webp'>('preserve');
  const [jpegQuality, setJpegQuality] = useState<number>(0.92);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setStripResult(null);

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid file format.');
      return;
    }

    setSelectedFile(file);

    // Create local object URL for preview
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);

    // Run metadata inspection locally
    setIsInspecting(true);
    try {
      const inspectedReport = await inspectImageMetadata(file);
      setReport(inspectedReport);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to inspect image metadata.');
    } finally {
      setIsInspecting(false);
    }
  };

  useEffect(() => {
    if (initialFile) {
      processFile(initialFile);
      if (onClearInitialFile) {
        onClearInitialFile();
      }
    }
  }, [initialFile]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    if (stripResult?.cleanUrl) URL.revokeObjectURL(stripResult.cleanUrl);
    setSelectedFile(null);
    setImagePreviewUrl(null);
    setReport(null);
    setStripResult(null);
    setErrorMsg(null);
    setTagSearchQuery('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecuteStrip = async () => {
    if (!selectedFile) return;
    setIsStripping(true);
    setErrorMsg(null);

    try {
      const result = await stripImageMetadata(selectedFile, {
        targetFormat,
        jpegQuality,
      });
      setStripResult(result);
      setActiveToolTab('cleaner');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sanitization failed. Please try a different format.');
    } finally {
      setIsStripping(false);
    }
  };

  const handleCopyMetadataJson = () => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const filteredTags = (report?.tags || []).filter(t => {
    if (!tagSearchQuery.trim()) return true;
    const q = tagSearchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.value.toLowerCase().includes(q) || t.group.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-medium text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-1 rounded-full">
          <Lock className="w-3.5 h-3.5 text-neutral-700" />
          <span>In-Browser Sanitization • Zero Server Uploads</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
          Image Metadata Inspector & Sanitizer
        </h1>
        <p className="text-sm text-neutral-500 max-w-xl leading-relaxed">
          Inspect hidden EXIF, GPS location coordinates, and camera serial numbers embedded in your photos.
          Strip all metadata locally before sharing online.
        </p>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm flex items-start space-x-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-neutral-800" />
          <div className="flex-1">
            <span className="font-semibold">Notice: </span>
            {errorMsg}
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs hover:underline text-neutral-600 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Zone (when no file is selected) */}
      {!selectedFile && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 sm:p-16 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-neutral-900 bg-neutral-50'
              : 'border-neutral-200 hover:border-neutral-900 bg-white hover:bg-neutral-50/50 shadow-subtle'
          }`}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload an image to inspect metadata"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.tiff,.tif,.bmp,image/*"
            onChange={handleFileInputChange}
            className="hidden"
            id="image-file-input"
          />

          <div className="max-w-sm mx-auto space-y-4 pointer-events-none">
            <div className="w-12 h-12 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center mx-auto text-neutral-700">
              <Upload className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-neutral-900">
                Drag and drop your photo here, or click to browse
              </p>
              <p className="text-xs text-neutral-500">
                Supports JPEG, PNG, and WebP (Up to 50 MB)
              </p>
            </div>

            <div className="pt-2">
              <span className="btn-primary pointer-events-auto text-xs px-6 py-2.5">
                Select Photo
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active File Management Dashboard */}
      {selectedFile && (
        <div className="space-y-8">
          {/* File summary bar */}
          <div className="p-4 sm:p-5 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              {imagePreviewUrl && (
                <img
                  src={imagePreviewUrl}
                  alt="Thumbnail"
                  className="w-12 h-12 object-cover rounded-lg border border-neutral-200 bg-white flex-shrink-0"
                />
              )}
              <div className="space-y-0.5">
                <div className="font-semibold text-neutral-900 text-sm truncate max-w-xs sm:max-w-md">
                  {selectedFile.name}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 font-mono">
                  <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  <span>•</span>
                  <span>{selectedFile.type || 'Unknown Format'}</span>
                  {report && (
                    <>
                      <span>•</span>
                      <span>{report.rawTagCount} metadata tags</span>
                      {report.hasGps && (
                        <>
                          <span>•</span>
                          <span className="text-neutral-900 font-semibold">GPS detected</span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-end md:self-center">
              <button
                onClick={handleReset}
                className="btn-secondary px-3 py-1.5 text-xs font-medium flex items-center space-x-1.5"
                aria-label="Remove image and clear memory"
              >
                <Trash2 className="w-3.5 h-3.5 text-neutral-500" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Tool Navigation Tabs */}
          <div className="flex space-x-2 border-b border-neutral-200 pb-2">
            <button
              onClick={() => setActiveToolTab('inspector')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                activeToolTab === 'inspector'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>1. Inspect Metadata ({report?.rawTagCount ?? 0})</span>
            </button>
            <button
              onClick={() => setActiveToolTab('cleaner')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                activeToolTab === 'cleaner'
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              <span>2. Strip & Export</span>
            </button>
          </div>

          {/* TAB 1: METADATA INSPECTOR */}
          {activeToolTab === 'inspector' && (
            <div className="space-y-6">
              {/* GPS Alert (if present) */}
              {report?.hasGps && report.gpsCoordinates && (
                <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                  <div className="flex items-center space-x-2 font-semibold text-xs text-neutral-900">
                    <MapPin className="w-4 h-4 text-neutral-800" />
                    <span>Precise Geolocation Coordinates Embedded</span>
                  </div>
                  <div className="font-mono text-xs bg-white p-3 rounded-lg border border-neutral-200 text-neutral-900 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span>Lat: {report.gpsCoordinates.latitude.toFixed(6)}</span>
                      <span className="mx-2 text-neutral-300">•</span>
                      <span>Lon: {report.gpsCoordinates.longitude.toFixed(6)}</span>
                    </div>
                    {report.gpsCoordinates.mapsLink && (
                      <a
                        href={report.gpsCoordinates.mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-900 font-semibold hover:underline inline-flex items-center space-x-1"
                      >
                        <span>Open Map</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Tag Search and Table */}
              <div className="ghost-card bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-50">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search tags (e.g. GPS, Model, Make)..."
                      value={tagSearchQuery}
                      onChange={e => setTagSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white border border-neutral-200 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopyMetadataJson}
                      className="btn-secondary px-3 py-1.5 text-xs font-mono flex items-center space-x-1"
                    >
                      {copiedJson ? <Check className="w-3.5 h-3.5 text-neutral-900" /> : <Copy className="w-3.5 h-3.5 text-neutral-500" />}
                      <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                    </button>

                    <button
                      onClick={() => setActiveToolTab('cleaner')}
                      className="btn-primary px-3 py-1.5 text-xs font-medium"
                    >
                      Strip All Metadata
                    </button>
                  </div>
                </div>

                {isInspecting ? (
                  <div className="p-12 text-center text-xs text-neutral-500 font-mono">
                    Inspecting container segments...
                  </div>
                ) : filteredTags.length === 0 ? (
                  <div className="p-12 text-center space-y-2">
                    <div className="text-sm font-semibold text-neutral-900">
                      {report?.rawTagCount === 0 ? 'No Metadata Found' : 'No Matching Tags'}
                    </div>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto">
                      {report?.rawTagCount === 0
                        ? 'This image contains no readable EXIF, GPS, or IPTC metadata chunks.'
                        : 'Try searching for a different property name or value.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase text-[11px]">
                        <tr>
                          <th className="py-2.5 px-4 font-medium">Tag</th>
                          <th className="py-2.5 px-4 font-medium">Group</th>
                          <th className="py-2.5 px-4 font-medium">Value</th>
                          <th className="py-2.5 px-4 font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 font-mono">
                        {filteredTags.map((tag, idx) => (
                          <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                            <td className="py-2.5 px-4 font-semibold text-neutral-900">
                              {tag.name}
                            </td>
                            <td className="py-2.5 px-4 text-neutral-500 text-[11px]">
                              {tag.group}
                            </td>
                            <td className="py-2.5 px-4 text-neutral-700 max-w-xs truncate">
                              {tag.value}
                            </td>
                            <td className="py-2.5 px-4">
                              {tag.isSensitive ? (
                                <span className="inline-flex items-center text-neutral-900 font-medium text-[10px] bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                                  Sensitive
                                </span>
                              ) : (
                                <span className="text-neutral-400 text-[10px]">Technical</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: METADATA STRIPPER & EXPORT */}
          {activeToolTab === 'cleaner' && (
            <div className="space-y-6">
              {/* Sanitization Options */}
              <div className="ghost-card p-6 bg-white border border-neutral-200 rounded-xl space-y-6">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">Sanitization Settings</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Configure export format and visual orientation normalization.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 block">Export Format</label>
                    <select
                      value={targetFormat}
                      onChange={e => setTargetFormat(e.target.value as any)}
                      className="w-full p-2 rounded-md bg-neutral-50 border border-neutral-200 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                    >
                      <option value="preserve">Preserve Original Format</option>
                      <option value="image/jpeg">JPEG (Clean Photographic)</option>
                      <option value="image/png">PNG (Lossless Sanitized)</option>
                      <option value="image/webp">WebP (Modern Lightweight)</option>
                    </select>
                  </div>

                  {(targetFormat === 'image/jpeg' || (targetFormat === 'preserve' && selectedFile.type === 'image/jpeg')) && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <label className="font-semibold text-neutral-700">JPEG Quality</label>
                        <span className="font-mono text-neutral-500">{Math.round(jpegQuality * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.70"
                        max="1.00"
                        step="0.01"
                        value={jpegQuality}
                        onChange={e => setJpegQuality(parseFloat(e.target.value))}
                        className="w-full accent-neutral-900 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleExecuteStrip}
                    disabled={isStripping}
                    className="btn-primary w-full sm:w-auto px-6 py-2.5 text-xs font-semibold disabled:opacity-50"
                  >
                    <span>{isStripping ? 'Sanitizing Metadata Locally...' : 'Strip Metadata & Generate Clean Image'}</span>
                  </button>
                </div>
              </div>

              {/* Strip Result Card (Clean Before/After Comparison) */}
              {stripResult && (
                <div className="ghost-card rounded-xl p-6 bg-white border border-neutral-200 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-neutral-900">
                      <Check className="w-4 h-4 text-neutral-900" />
                      <h2 className="font-semibold text-sm">Metadata Stripped Successfully</h2>
                    </div>
                    <span className="text-xs font-mono text-neutral-600 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded">
                      0 EXIF Tags Remaining
                    </span>
                  </div>

                  {stripResult.conversionNotice && (
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs text-neutral-700 flex items-start space-x-2">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-neutral-500" />
                      <span>{stripResult.conversionNotice}</span>
                    </div>
                  )}

                  {/* Clean Before-and-After Comparison Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                      <div className="text-neutral-500">Original Size</div>
                      <div className="font-mono text-sm font-semibold text-neutral-900 mt-1">
                        {(stripResult.originalSize / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                      <div className="text-neutral-500">Cleaned Size</div>
                      <div className="font-mono text-sm font-semibold text-neutral-900 mt-1">
                        {(stripResult.cleanSize / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                      <div className="text-neutral-500">Tags Removed</div>
                      <div className="font-mono text-sm font-semibold text-neutral-900 mt-1">
                        {report?.rawTagCount ?? 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                      <div className="text-neutral-500">Output Format</div>
                      <div className="font-mono text-sm font-semibold text-neutral-900 mt-1">
                        {stripResult.cleanMimeType}
                      </div>
                    </div>
                  </div>

                  {stripResult.orientationNormalized && (
                    <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-700 text-xs flex items-start space-x-2">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-neutral-500" />
                      <span>
                        EXIF orientation ({stripResult.originalOrientation}: {stripResult.orientationDescription}) was normalized into the visual canvas. The photo stays upright without needing orientation tags.
                      </span>
                    </div>
                  )}

                  {/* Download Action */}
                  <div className="pt-2">
                    <a
                      href={stripResult.cleanUrl}
                      download={stripResult.downloadFileName}
                      className="btn-primary px-6 py-2.5 text-xs font-semibold inline-flex items-center space-x-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Clean Photo ({stripResult.downloadFileName})</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PrivacyToolsPage;
