#!/bin/bash
#
# Video Optimization Script for Playfunia
#
# Converts MOV files to MP4 (H.264) and WebM (VP9) formats
# for better web compatibility and smaller file sizes.
#
# Requirements:
#   - FFmpeg with libx264 and libvpx-vp9 support
#
# Usage:
#   npm run optimize:videos
#   or
#   bash scripts/optimize-videos.sh
#
# Output:
#   public/videos/optimized/
#     ├── playground/
#     │   ├── ball-pit-play.mp4
#     │   ├── ball-pit-play.webm
#     │   ├── ball-pit-play-poster.jpg
#     │   └── ...
#     └── ...

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"
INPUT_DIR="$PUBLIC_DIR/videos"
OUTPUT_DIR="$PUBLIC_DIR/videos/optimized"

# Video encoding settings
MP4_CRF=28      # Lower = better quality (18-28 is good range)
WEBM_CRF=32     # VP9 CRF (30-35 is good range)
AUDIO_BITRATE="128k"
SCALE_WIDTH=1280  # Max width for output videos

echo "🎬 Playfunia Video Optimization"
echo "================================"
echo ""

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is required but not installed."
    echo "   Install with: sudo apt install ffmpeg"
    exit 1
fi

# Clean and create output directory
echo "🧹 Cleaning output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/playground"

# Track totals
total_original=0
total_optimized=0

# Function to convert bytes to human readable
format_size() {
    local size=$1
    if [ $size -lt 1024 ]; then
        echo "${size}B"
    elif [ $size -lt 1048576 ]; then
        echo "$(echo "scale=1; $size/1024" | bc)KB"
    else
        echo "$(echo "scale=1; $size/1048576" | bc)MB"
    fi
}

# Function to process a single video
process_video() {
    local input_file="$1"
    local rel_path="${input_file#$INPUT_DIR/}"
    local dir_name="$(dirname "$rel_path")"
    local base_name="$(basename "$rel_path" .mov)"
    local base_name="${base_name%.MOV}"  # Handle uppercase extension

    # Create output directory if needed
    mkdir -p "$OUTPUT_DIR/$dir_name"

    local output_mp4="$OUTPUT_DIR/$dir_name/$base_name.mp4"
    local output_webm="$OUTPUT_DIR/$dir_name/$base_name.webm"
    local output_poster="$OUTPUT_DIR/$dir_name/$base_name-poster.jpg"

    local input_size=$(stat -f%z "$input_file" 2>/dev/null || stat -c%s "$input_file")
    total_original=$((total_original + input_size))

    echo ""
    echo "📹 Processing: $rel_path ($(format_size $input_size))"

    # Generate poster image from first frame
    echo "   Generating poster..."
    ffmpeg -y -i "$input_file" -vframes 1 -q:v 2 \
        -vf "scale='min($SCALE_WIDTH,iw)':-2" \
        "$output_poster" 2>/dev/null

    # Convert to MP4 (H.264)
    echo "   Converting to MP4..."
    ffmpeg -y -i "$input_file" \
        -c:v libx264 -crf $MP4_CRF -preset slow \
        -c:a aac -b:a $AUDIO_BITRATE \
        -vf "scale='min($SCALE_WIDTH,iw)':-2" \
        -movflags +faststart \
        "$output_mp4" 2>/dev/null

    local mp4_size=$(stat -f%z "$output_mp4" 2>/dev/null || stat -c%s "$output_mp4")
    echo "   ✓ MP4: $(format_size $mp4_size)"

    # Convert to WebM (VP9)
    echo "   Converting to WebM..."
    ffmpeg -y -i "$input_file" \
        -c:v libvpx-vp9 -crf $WEBM_CRF -b:v 0 \
        -c:a libopus -b:a $AUDIO_BITRATE \
        -vf "scale='min($SCALE_WIDTH,iw)':-2" \
        "$output_webm" 2>/dev/null

    local webm_size=$(stat -f%z "$output_webm" 2>/dev/null || stat -c%s "$output_webm")
    echo "   ✓ WebM: $(format_size $webm_size)"

    local poster_size=$(stat -f%z "$output_poster" 2>/dev/null || stat -c%s "$output_poster")
    echo "   ✓ Poster: $(format_size $poster_size)"

    total_optimized=$((total_optimized + mp4_size + webm_size + poster_size))
}

# Process hero videos
echo "Processing hero videos..."
for video in "$INPUT_DIR"/hero-video-*.mov "$INPUT_DIR"/hero-video-*.MOV; do
    if [ -f "$video" ]; then
        base_name="$(basename "$video" .mov)"
        base_name="${base_name%.MOV}"
        output_mp4="$OUTPUT_DIR/$base_name.mp4"
        output_webm="$OUTPUT_DIR/$base_name.webm"
        output_poster="$OUTPUT_DIR/$base_name-poster.jpg"

        input_size=$(stat -f%z "$video" 2>/dev/null || stat -c%s "$video")
        total_original=$((total_original + input_size))

        echo ""
        echo "📹 Processing: $(basename "$video") ($(format_size $input_size))"

        # Generate poster
        echo "   Generating poster..."
        ffmpeg -y -i "$video" -vframes 1 -q:v 2 \
            -vf "scale='min($SCALE_WIDTH,iw)':-2" \
            "$output_poster" 2>/dev/null

        # MP4
        echo "   Converting to MP4..."
        ffmpeg -y -i "$video" \
            -c:v libx264 -crf $MP4_CRF -preset slow \
            -c:a aac -b:a $AUDIO_BITRATE \
            -vf "scale='min($SCALE_WIDTH,iw)':-2" \
            -movflags +faststart \
            "$output_mp4" 2>/dev/null

        mp4_size=$(stat -f%z "$output_mp4" 2>/dev/null || stat -c%s "$output_mp4")
        echo "   ✓ MP4: $(format_size $mp4_size)"

        # WebM
        echo "   Converting to WebM..."
        ffmpeg -y -i "$video" \
            -c:v libvpx-vp9 -crf $WEBM_CRF -b:v 0 \
            -c:a libopus -b:a $AUDIO_BITRATE \
            -vf "scale='min($SCALE_WIDTH,iw)':-2" \
            "$output_webm" 2>/dev/null

        webm_size=$(stat -f%z "$output_webm" 2>/dev/null || stat -c%s "$output_webm")
        echo "   ✓ WebM: $(format_size $webm_size)"

        poster_size=$(stat -f%z "$output_poster" 2>/dev/null || stat -c%s "$output_poster")
        echo "   ✓ Poster: $(format_size $poster_size)"

        total_optimized=$((total_optimized + mp4_size + webm_size + poster_size))
    fi
done

# Process playground videos
echo ""
echo "Processing playground videos..."
for video in "$INPUT_DIR"/playground/*.mov "$INPUT_DIR"/playground/*.MOV; do
    if [ -f "$video" ]; then
        process_video "$video"
    fi
done

# Summary
echo ""
echo "================================"
echo "📊 Optimization Summary"
echo "================================"
echo "Original total:  $(format_size $total_original)"
echo "Optimized total: $(format_size $total_optimized)"

if [ $total_original -gt 0 ]; then
    saved=$((total_original - total_optimized))
    percent=$((100 - (total_optimized * 100 / total_original)))
    echo "Space saved:     $(format_size $saved) ($percent%)"
fi

echo "Output directory: ${OUTPUT_DIR#$PUBLIC_DIR/}"
echo ""
echo "🎉 Video optimization complete!"
