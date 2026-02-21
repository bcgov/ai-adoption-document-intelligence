# Image Service

Python-based image preprocessing service using OpenCV for document image enhancement and normalization before OCR processing.

## Overview

The Image Service provides a comprehensive suite of image processing tools designed to prepare scanned documents and images for optimal OCR accuracy. It addresses common image quality issues such as noise, skew, incorrect orientation, scaling problems, and positioning inconsistencies.

## Features

### Image Quality Enhancement

#### Noise Reduction (`tools/noise.py`)
- **Noise Detection** - Calculate mean and standard deviation of image noise
- **Denoising** - Non-local means denoising with configurable parameters
  - `denoise()` - Grayscale denoising
  - `denoise_binary()` - Binary (black/white) denoising
- **Use Cases**: Scanned documents with scanner artifacts, low-quality camera captures

#### Color Manipulation (`tools/colour.py`)
- **Grayscale Conversion** - Convert BGR images to grayscale
- **Binary Conversion** - Adaptive thresholding (Otsu's method) for black/white only
- **Use Cases**: Preprocessing for OCR, reducing file size, simplifying document analysis

### Geometric Corrections

#### Skew Correction (`tools/skew.py`)
Two types of skew correction:

**Rotational Skew** - `rotational_skew()`
- Automatic deskewing to nearest 90° angle
- Uses minimum area rectangle detection on text pixels
- Returns corrected image and original angle
- **Use Cases**: Documents scanned at slight angles (< 45°)

**Perspective Skew** - `perspective_skew()`
- Corrects perspective distortion (e.g., photos of documents)
- Line detection using Hough transforms
- Perspective transformation to straighten
- **Use Cases**: Mobile phone photos of documents, angled document captures

#### Orientation Correction (`tools/orientation.py`)
- **Rotation** - `rotate(image, degrees)`
  - Rotate image by any angle (optimized for 90° increments)
  - Expands canvas to prevent cropping
  - Maintains image integrity during rotation
  
- **Auto-Orientation** - `determine_rotation_angle(image, anchor)`
  - Template matching against anchor image
  - Tests 0°, 90°, 180°, 270° rotations
  - Returns optimal rotation angle
  - **Use Cases**: Documents scanned in wrong orientation, batch processing

#### Scaling & Resizing (`tools/size.py`)
- **Percentage Scaling** - `scale(image, percent)`
  - Resize by percentage (e.g., 50%, 200%)
  
- **Exact Resizing** - `resize(image, target_width, target_height)`
  - Resize to specific dimensions
  
- **Anchor-Based Scaling** - `resize_to_anchor(image, anchor)`
  - Feature-based scaling using ORB (Oriented FAST and Rotated BRIEF)
  - Preserves aspect ratio
  - Matches features between image and reference anchor
  - Returns resized image and detected scale factor
  - **Use Cases**: Normalizing document sizes, standardizing input for OCR models

#### Positioning & Alignment (`tools/positioning.py`)
- **Black Pixel Alignment** - `align_image_by_black_pixels(image, target_pos)`
  - Detects top-left content anchor based on black pixel concentration
  - Translates image to align content with target position
  - **Use Cases**: Standardizing document position, aligning form fields

- **Anchor Detection** - `find_black_anchor(image)`
  - Finds first significant black pixel concentration from top-left
  - Configurable thresholds for "blackness" and density
  - Returns (x, y) coordinates

## Tech Stack

- **OpenCV (cv2)** - Core image processing library
- **NumPy** - Numerical operations and array manipulation
- **Python 3.12+** - Modern Python with type hints

## Prerequisites

- Python 3.12 or higher
- `uv` - Modern Python package manager (recommended)

## Setup

### 1. Create Virtual Environment

Using `uv` (recommended):
```bash
uv venv
```

Or using Python's built-in venv:
```bash
python -m venv .venv
```

### 2. Activate Virtual Environment

**Linux/macOS:**
```bash
source .venv/bin/activate
```

**Windows:**
```cmd
.venv\Scripts\activate
```

### 3. Install Dependencies

Using `uv`:
```bash
uv sync
```

Or using pip:
```bash
pip install -e .
```

### 4. (Optional) Configure VS Code

Set your Python interpreter to `.venv/bin/python` for correct import resolution and IntelliSense.

**Command Palette:** `Python: Select Interpreter` → Choose `.venv/bin/python`

## Usage

### Running the Test Script

The `main.py` file demonstrates all image processing capabilities:

```bash
# Using uv
uv run main.py

# Or directly with Python
python main.py
```

This will process test images from `test-images/` and output results to `result-images/`.

### Using Individual Tools

```python
import cv2
from tools import noise, skew, orientation, size, colour, positioning

# Load image
image = cv2.imread("path/to/document.jpg")

# 1. Denoise
mean_noise, std_noise = noise.calculate_noise_metrics(image)
if mean_noise > 50:  # Threshold
    image = noise.denoise(image)

# 2. Deskew (rotational)
deskewed, angle = skew.rotational_skew(image)
print(f"Corrected {angle}° skew")

# 3. Correct orientation
anchor = cv2.imread("reference_anchor.png")
rotation_angle = orientation.determine_rotation_angle(image, anchor)
corrected = orientation.rotate(image, rotation_angle)

# 4. Resize to standard size
resized = size.resize(corrected, target_width=2480, target_height=3508)

# 5. Convert to grayscale for OCR
gray = colour.toGreyscale(resized)

# 6. Align to top-left
aligned = positioning.align_image_by_black_pixels(gray, target_pos=(0, 0))

# Save result
cv2.imwrite("processed_document.jpg", aligned)
```

## API Reference

### `tools/noise.py`

#### `calculate_noise_metrics(image) -> Tuple[float, float]`
Returns mean and standard deviation of image noise.

**Parameters:**
- `image` (numpy.ndarray) - Input image

**Returns:** `(mean_noise, std_noise)`

#### `denoise(image) -> numpy.ndarray`
Applies non-local means denoising (grayscale).

**Parameters:**
- `image` (numpy.ndarray) - Input image

**Returns:** Denoised grayscale image

#### `denoise_binary(image) -> numpy.ndarray`
Applies non-local means denoising (binary black/white).

**Parameters:**
- `image` (numpy.ndarray) - Input image

**Returns:** Denoised binary image

### `tools/skew.py`

#### `rotational_skew(image) -> Tuple[numpy.ndarray, float]`
Deskews image to nearest 90° alignment.

**Parameters:**
- `image` (numpy.ndarray) - Input image

**Returns:** `(rotated_image, original_angle)`

#### `perspective_skew(image) -> numpy.ndarray`
Corrects perspective distortion using line detection.

**Parameters:**
- `image` (numpy.ndarray) - Input image

**Returns:** Perspective-corrected image

#### `detect_lines(img, vertical=True, min_length=50) -> List[Tuple]`
Detects lines in image (used internally for perspective correction).

**Parameters:**
- `img` - Input image
- `vertical` (bool) - True for vertical lines, False for horizontal
- `min_length` (int) - Minimum line length in pixels

**Returns:** List of detected lines as `(x1, y1, x2, y2)` tuples

### `tools/orientation.py`

#### `rotate(image, degrees) -> numpy.ndarray`
Rotates image by specified degrees.

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `degrees` (float) - Rotation angle (positive = counter-clockwise)

**Returns:** Rotated image with expanded canvas

#### `determine_rotation_angle(image, anchor) -> int`
Auto-detects optimal rotation (0°, 90°, 180°, 270°).

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `anchor` (numpy.ndarray) - Reference template image

**Returns:** Optimal rotation angle

### `tools/size.py`

#### `scale(image, percent) -> numpy.ndarray`
Scales image by percentage.

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `percent` (float) - Scale percentage (e.g., 50, 150)

**Returns:** Scaled image

#### `resize(image, target_width, target_height) -> numpy.ndarray`
Resizes to exact dimensions.

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `target_width` (int) - Target width in pixels
- `target_height` (int) - Target height in pixels

**Returns:** Resized image

#### `resize_to_anchor(image, anchor) -> Tuple[numpy.ndarray, float]`
Scales image to match anchor using feature detection.

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `anchor` (numpy.ndarray) - Reference image with correct size

**Returns:** `(resized_image, scale_factor)`

### `tools/colour.py`

#### `toGreyscale(image) -> numpy.ndarray`
Converts BGR image to grayscale.

**Parameters:**
- `image` (numpy.ndarray) - Input BGR image

**Returns:** Grayscale image

#### `toBlackWhite(image) -> numpy.ndarray`
Converts to binary black/white using Otsu's thresholding.

**Parameters:**
- `image` (numpy.ndarray) - Input image

**Returns:** Binary image

### `tools/positioning.py`

#### `align_image_by_black_pixels(image, target_pos) -> numpy.ndarray`
Aligns document content to target position.

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `target_pos` (Tuple[int, int]) - Target (x, y) offset from top-left

**Returns:** Aligned image

#### `find_black_anchor(image, black_thresh=40, density_thresh=0.02) -> Tuple[int, int]`
Finds top-left content anchor based on black pixels.

**Parameters:**
- `image` (numpy.ndarray) - Input image
- `black_thresh` (int) - Threshold for considering pixels "black" (0-255)
- `density_thresh` (float) - Minimum black pixel density (0.0-1.0)

**Returns:** `(anchor_x, anchor_y)` coordinates

## Project Structure

```
image-service/
├── tools/                  # Image processing modules
│   ├── __init__.py
│   ├── noise.py           # Noise detection and reduction
│   ├── skew.py            # Rotational and perspective correction
│   ├── orientation.py     # Rotation and auto-orientation
│   ├── size.py            # Scaling and resizing
│   ├── colour.py          # Color space conversions
│   └── positioning.py     # Alignment and positioning
│
├── test-images/           # Sample input images
├── result-images/         # Output directory (auto-created)
│
├── main.py                # Test/demo script
├── pyproject.toml         # Python project configuration
└── README.md              # This file
```

## Testing

The `main.py` script includes test functions for each capability:

```python
# Test functions in main.py
denoise()       # Noise reduction test
deskew()        # Rotational and perspective skew correction
rotate()        # Auto-orientation with anchor
resize()        # Anchor-based scaling
colours()       # Grayscale and binary conversion
position()      # Content alignment
```

Add test images to `test-images/` and run:
```bash
python main.py
```

Results appear in `result-images/`.

## Integration with Document Intelligence Platform

This service is designed to preprocess images before sending them to OCR services:

1. **Upload** - User uploads document via frontend
2. **Preprocess** - Image service applies transformations
3. **OCR** - Processed image sent to Azure Document Intelligence
4. **Extract** - Higher accuracy OCR results

### Integration Points

- Can be invoked as a workflow activity in Temporal workflows
- HTTP API wrapper can be added for backend integration
- Supports batch processing for training dataset preparation

## Performance Considerations

- **Image Size**: Larger images take longer to process
- **Noise Reduction**: Most computationally expensive operation
- **Feature Detection**: Anchor-based scaling requires sufficient features
- **Memory**: OpenCV operations are memory-intensive for large images

**Recommendations:**
- Downscale very large images (> 5000x5000) before processing
- Use binary conversion for performance when color not needed
- Cache processed images to avoid reprocessing

## Development

### Adding New Tools

1. Create module in `tools/` directory
2. Import in `tools/__init__.py`
3. Add test function in `main.py`
4. Update this README with API documentation

### Example: Adding a new tool

```python
# tools/my_tool.py
import cv2

def my_transformation(image):
    """
    Description of transformation.
    
    :param image: Input image
    :returns: Transformed image
    """
    # Your implementation
    result = cv2.someOperation(image)
    return result
```

### Code Style

- Follow PEP 8 style guide
- Use type hints where applicable
- Document functions with docstrings
- Keep functions focused and reusable

## Troubleshooting

### Import Errors

Ensure dependencies are installed:
```bash
uv sync
# or
pip install -e .
```

Set Python interpreter to `.venv/bin/python` in your IDE.

### OpenCV Not Found

Reinstall opencv-python:
```bash
pip install --force-reinstall opencv-python
```

### Feature Detection Failures

If `resize_to_anchor()` fails with "Not enough matches":
- Ensure anchor and image have similar visual features
- Try increasing `nfeatures` in ORB detector
- Use a more distinctive anchor image

### Perspective Correction Issues

If `perspective_skew()` doesn't correct properly:
- Ensure document has clear straight lines
- Adjust `min_length` in `detect_lines()`
- Try preprocessing with noise reduction first

## Future Enhancements

- [ ] HTTP API server (FastAPI/Flask)
- [ ] Batch processing support
- [ ] Configurable pipelines via JSON/YAML
- [ ] Additional preprocessing: blur detection, shadow removal, border cropping
- [ ] GPU acceleration with OpenCV CUDA
- [ ] REST endpoints for each tool
- [ ] Docker containerization

## License

Apache License 2.0
