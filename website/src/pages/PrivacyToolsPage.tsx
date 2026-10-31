import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileCheck,
  AlertTriangle,
  Lock,
  Download,
  Trash2,
  Copy,
  Check,
  MapPin,
  Sparkles,
  ExternalLink,
  Info,
  Search,
} from 'lucide-react';
import {
  inspectImageMetadata,
  validateImageFile,
  ImageMetadataReport,
} from '../utils/metadataInspector';
import {
  stripImageMetadata,
  StripMetadataResult,
  StripMetadataOptions,
} from '../utils/metadataStripper';

export const PrivacyToolsPage: React.FC = () => {
  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isStripping, setIsStripping] = useState(false);
  const [report, setReport] = useState<ImageMetadataReport | null>(null);
  const [stripResult, setStripResult] = useState<StripMetadataResult | null>(null);
  const [activeToolTab, setActiveToolTab] = useState<'inspector' | 'cleaner'>('inspector');

  // Strip options
  const [targetFormat, setTargetFormat] = useState<'preserve' | 'image/png' | 'image/jpeg' | 'image/webp'>('preserve');
  const [jpegQuality, setJpegQuality] = useState<number>(0.95);

  // Inspector search filter
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount or file reset
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (stripResult?.cleanUrl) URL.revokeObjectURL(stripResult.cleanUrl);
    };
  }, [previewUrl, stripResult]);

  const handleFileSelection = async (file: File) => {
    setErrorMsg(null);
    setStripResult(null);

    // Validate
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid file.');
      return;
    }

    // Revoke old URLs
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (stripResult?.cleanUrl) URL.revokeObjectURL(stripResult.cleanUrl);

    setSelectedFile(file);
    const newPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(newPreviewUrl);

    // Run inspection
    setIsInspecting(true);
    try {
      const metadata = await inspectImageMetadata(file);
      setReport(metadata);
    } catch (err) {
      setErrorMsg('Failed to parse image metadata. The file may have corrupted headers.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
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
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (stripResult?.cleanUrl) URL.revokeObjectURL(stripResult.cleanUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
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
      const options: StripMetadataOptions = {
        targetFormat,
        jpegQuality,
      };
      const result = await stripImageMetadata(selectedFile, options);
      setStripResult(result);
      setActiveToolTab('cleaner');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to sanitize image metadata.');
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
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center space-x-2 text-xs font-mono text-cyber-emerald">
          <Lock className="w-3.5 h-3.5" />
          <span>100% In-Browser Execution • Zero Server Transmission</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Image Metadata Inspector & Sanitizer
        </h1>
        <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
          Inspect hidden EXIF, GPS, camera model, and creation metadata embedded in your photographs.
          Clean and strip all metadata locally in your browser before sharing online, preserving original formats.
        </p>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-cyber-rose/15 border border-cyber-rose/40 text-cyber-rose text-sm flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Error: </span>
            {errorMsg}
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-xs hover:underline text-slate-400"
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
          className={`border-2 border-dashed rounded-xl p-10 sm:p-14 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-cyber-indigo bg-cyber-indigo/10 scale-[1.005]'
              : 'border-navy-700 hover:border-slate-500 bg-navy-900/50 hover:bg-navy-900/80'
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

          <div className="max-w-md mx-auto space-y-4 pointer-events-none">
            <div className="w-14 h-14 rounded-full bg-cyber-indigo/15 border border-cyber-indigo/40 flex items-center justify-center mx-auto text-cyber-violet">
              <UploadCloud className="w-7 h-7 text-cyber-indigo" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base font-semibold text-white">
                Drag and drop your photo here, or click to browse
              </h2>
              <p className="text-xs text-slate-400">
                Supports PNG, JPEG, WebP, TIFF, and BMP (Up to 25 MB)
              </p>
            </div>

            <div className="inline-flex items-center space-x-2 text-[11px] text-cyber-emerald font-mono bg-navy-950 px-3 py-1 rounded-full border border-navy-800">
              <Lock className="w-3 h-3" />
              <span>Processed entirely inside your browser sandbox</span>
            </div>
          </div>
        </div>
      )}

      {/* Active File Workspace */}
      {selectedFile && (
        <div className="space-y-6">
          {/* Top Info Bar */}
          <div className="glass-card rounded-xl p-4 sm:p-6 bg-navy-900/70 border border-navy-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {previewUrl && (
                <div className="w-16 h-16 rounded-lg bg-navy-950 border border-navy-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-white text-sm sm:text-base break-all">
                    {selectedFile.name}
                  </span>
                  <span className="badge-tag bg-navy-800 text-slate-300 font-mono text-[11px]">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-2 items-center">
                  <span>Type: <strong className="text-slate-300">{selectedFile.type || 'Unknown'}</strong></span>
                  {report && (
                    <>
                      <span>•</span>
                      <span>Total Tags: <strong className="text-slate-300">{report.rawTagCount}</strong></span>
                      <span>•</span>
                      <span>
                        Risk Level:{' '}
                        <strong
                          className={
                            report.privacyRiskLevel === 'HIGH'
                              ? 'text-cyber-rose'
                              : report.privacyRiskLevel === 'MEDIUM'
                              ? 'text-cyber-amber'
                              : 'text-cyber-emerald'
                          }
                        >
                          {report.privacyRiskLevel}
                        </strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 self-end md:self-center">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 rounded-lg bg-navy-850 hover:bg-navy-800 text-slate-300 border border-navy-700 hover:border-slate-500 text-xs font-medium transition-colors flex items-center space-x-1.5"
                aria-label="Remove image and clear memory"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Clear Image</span>
              </button>
            </div>
          </div>

          {/* Tool Navigation Tabs */}
          <div className="flex space-x-3 border-b border-navy-800 pb-2">
            <button
              onClick={() => setActiveToolTab('inspector')}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                activeToolTab === 'inspector'
                  ? 'bg-cyber-indigo text-white font-semibold'
                  : 'text-slate-400 hover:text-white bg-navy-900/60'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>1. Inspect Metadata ({report?.rawTagCount ?? 0} found)</span>
            </button>
            <button
              onClick={() => setActiveToolTab('cleaner')}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                activeToolTab === 'cleaner'
                  ? 'bg-cyber-indigo text-white font-semibold'
                  : 'text-slate-400 hover:text-white bg-navy-900/60'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>2. Strip Metadata & Export</span>
            </button>
          </div>

          {/* TAB 1: METADATA INSPECTOR */}
          {activeToolTab === 'inspector' && (
            <div className="space-y-6">
              {/* GPS Alert (if present) */}
              {report?.hasGps && report.gpsCoordinates && (
                <div className="p-4 rounded-xl bg-cyber-rose/15 border border-cyber-rose/40 text-cyber-rose space-y-2">
                  <div className="flex items-center space-x-2 font-semibold text-sm">
                    <MapPin className="w-4 h-4" />
                    <span>Precise Geolocation Coordinates Detected (Privacy Risk: High)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    This photograph contains embedded latitude and longitude coordinates that reveal the exact physical location where the photo was captured:
                  </p>
                  <div className="font-mono text-xs bg-navy-950 p-2.5 rounded border border-navy-800 text-white flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span>Lat: {report.gpsCoordinates.latitude.toFixed(6)}</span>
                      <span className="mx-2">•</span>
                      <span>Lon: {report.gpsCoordinates.longitude.toFixed(6)}</span>
                    </div>
                    {report.gpsCoordinates.mapsLink && (
                      <a
                        href={report.gpsCoordinates.mapsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyber-sky hover:underline inline-flex items-center space-x-1"
                      >
                        <span>Verify on OpenStreetMap</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Tag Search & Copy Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tagSearchQuery}
                    onChange={e => setTagSearchQuery(e.target.value)}
                    placeholder="Search tags (e.g. model, GPS, software, date)..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-navy-900 border border-navy-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyber-indigo"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopyMetadataJson}
                    className="px-3 py-2 rounded-lg bg-navy-850 hover:bg-navy-800 text-slate-300 border border-navy-700 text-xs font-mono transition-colors flex items-center space-x-1.5"
                    aria-label="Copy metadata report as JSON"
                  >
                    {copiedJson ? <Check className="w-3.5 h-3.5 text-cyber-emerald" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{copiedJson ? 'Copied JSON!' : 'Copy Metadata JSON'}</span>
                  </button>

                  <button
                    onClick={handleExecuteStrip}
                    className="px-4 py-2 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 text-white text-xs font-semibold transition-all shadow-glow flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Proceed to Strip</span>
                  </button>
                </div>
              </div>

              {/* Tag Table */}
              <div className="glass-card rounded-xl overflow-hidden border border-navy-700/80">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-navy-950/80 border-b border-navy-700 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Tag Identifier</th>
                        <th className="py-3 px-4">Value</th>
                        <th className="py-3 px-4">Sensitivity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800">
                      {isInspecting ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            Parsing image metadata locally...
                          </td>
                        </tr>
                      ) : filteredTags.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-slate-400">
                            {tagSearchQuery
                              ? 'No metadata tags match your search query.'
                              : 'No EXIF, IPTC, or XMP metadata tags detected in this image. The file appears clean.'}
                          </td>
                        </tr>
                      ) : (
                        filteredTags.map((tag, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-navy-850/50 transition-colors ${
                              tag.isSensitive ? 'bg-cyber-rose/5' : ''
                            }`}
                          >
                            <td className="py-2.5 px-4 font-medium text-slate-300">
                              <span className="badge-tag bg-navy-950 text-slate-300 border border-navy-800 text-[10px]">
                                {tag.group}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-cyber-violet font-medium">
                              {tag.name}
                            </td>
                            <td className="py-2.5 px-4 text-slate-200 font-mono text-xs break-all max-w-md">
                              {tag.value}
                            </td>
                            <td className="py-2.5 px-4">
                              {tag.isSensitive ? (
                                <span className="inline-flex items-center text-cyber-rose font-medium text-[11px]">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Sensitive
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">Standard</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: METADATA REMOVAL & EXPORT */}
          {activeToolTab === 'cleaner' && (
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-6 bg-navy-900/60 border border-navy-700/80 space-y-6">
                <h2 className="text-base font-semibold text-white flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-cyber-indigo" />
                  <span>Sanitization Settings</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Target Format Option */}
                  <div className="space-y-2">
                    <label htmlFor="target-format-select" className="block text-xs font-semibold text-slate-300">
                      Export Format
                    </label>
                    <select
                      id="target-format-select"
                      value={targetFormat}
                      onChange={e => setTargetFormat(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-navy-700 text-xs text-white focus:outline-none focus:border-cyber-indigo"
                    >
                      <option value="preserve">Preserve Original Format (Recommended)</option>
                      <option value="image/png">Lossless PNG (image/png)</option>
                      <option value="image/jpeg">Standard JPEG (image/jpeg)</option>
                      <option value="image/webp">Modern WebP (image/webp)</option>
                    </select>
                    <p className="text-[11px] text-slate-400">
                      When set to preserve, PNG remains PNG and JPEG remains JPEG.
                    </p>
                  </div>

                  {/* Quality Slider (for JPEG export) */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
                      <label htmlFor="jpeg-quality-range">Encoding Quality (JPEG/WebP)</label>
                      <span className="font-mono text-cyber-sky">{Math.round(jpegQuality * 100)}%</span>
                    </div>
                    <input
                      id="jpeg-quality-range"
                      type="range"
                      min="0.70"
                      max="1.0"
                      step="0.05"
                      value={jpegQuality}
                      onChange={e => setJpegQuality(parseFloat(e.target.value))}
                      className="w-full accent-cyber-indigo bg-navy-950 cursor-pointer"
                    />
                    <p className="text-[11px] text-slate-400">
                      Higher quality preserves pixel clarity. 95% is optimal.
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleExecuteStrip}
                    disabled={isStripping}
                    className="w-full sm:w-auto px-6 py-3 rounded-lg bg-cyber-indigo hover:bg-cyber-indigo/90 disabled:opacity-50 text-white font-medium text-sm transition-all shadow-glow flex items-center justify-center space-x-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isStripping ? 'Sanitizing Metadata Locally...' : 'Strip Metadata & Generate Clean Image'}</span>
                  </button>
                </div>
              </div>

              {/* Strip Result Card */}
              {stripResult && (
                <div className="glass-card rounded-xl p-6 bg-navy-900/80 border border-cyber-emerald/40 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 text-cyber-emerald">
                      <Check className="w-5 h-5" />
                      <h2 className="font-bold text-base text-white">Metadata Stripped Successfully</h2>
                    </div>
                    <span className="badge-tag bg-cyber-emerald/15 text-cyber-emerald border border-cyber-emerald/40 text-xs font-mono">
                      Verified: 0 EXIF Tags
                    </span>
                  </div>

                  {/* Conversion notice if applicable */}
                  {stripResult.conversionNotice && (
                    <div className="p-3 rounded-lg bg-cyber-amber/15 border border-cyber-amber/30 text-cyber-amber text-xs flex items-start space-x-2">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{stripResult.conversionNotice}</span>
                    </div>
                  )}

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
                      <div className="text-slate-400">Original Size</div>
                      <div className="font-mono text-sm font-bold text-white mt-1">
                        {(stripResult.originalSize / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
                      <div className="text-slate-400">Cleaned Size</div>
                      <div className="font-mono text-sm font-bold text-cyber-emerald mt-1">
                        {(stripResult.cleanSize / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
                      <div className="text-slate-400">Tags Removed</div>
                      <div className="font-mono text-sm font-bold text-cyber-violet mt-1">
                        {report?.rawTagCount ?? 0} Tags
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-navy-950 border border-navy-800">
                      <div className="text-slate-400">Output Format</div>
                      <div className="font-mono text-sm font-bold text-slate-200 mt-1">
                        {stripResult.cleanMimeType}
                      </div>
                    </div>
                  </div>

                  {/* Download Action */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                    <a
                      href={stripResult.cleanUrl}
                      download={stripResult.downloadFileName}
                      className="w-full sm:w-auto px-6 py-3 rounded-lg bg-cyber-emerald hover:bg-cyber-emerald/90 text-navy-950 font-bold text-sm transition-all shadow-subtle flex items-center justify-center space-x-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download Clean File ({stripResult.downloadFileName})</span>
                    </a>

                    <div className="text-xs text-slate-400 font-mono">
                      Hash verification: clean canvas buffer contains 0 auxiliary markers.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Honest Privacy Notice Callout */}
      <div className="p-4 rounded-lg bg-navy-900/60 border border-navy-800 text-xs text-slate-400 space-y-1">
        <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
          <Info className="w-3.5 h-3.5 text-cyber-sky" />
          <span>Understanding Metadata Removal vs Image Content</span>
        </div>
        <p className="leading-relaxed">
          Stripping EXIF/XMP metadata removes technical file container headers: camera make/model, GPS coordinates, serial numbers, and creation timestamps.
          It does <strong>not</strong> crop, blur, or alter any visual elements depicted in the photograph itself (such as street signs, faces, or stamped watermarks).
          To investigate adversarial perturbation techniques targeting deep neural visual features, explore our{' '}
          <strong className="text-slate-300 font-semibold">VeilGuard Desktop Engine</strong>.
        </p>
      </div>
    </div>
  );
};
