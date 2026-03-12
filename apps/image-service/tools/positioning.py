import cv2
import numpy as np
from tools import colour


def align_image_by_black_pixels(image, target_pos):
    """
    Aligns a document to the top-left corner based on where black pixels start

    :param image: Original image
    :param target_pos: Offset from top-left corner (x,y)
    """
    anchor_x, anchor_y = find_black_anchor(image)

    tx, ty = target_pos
    dx = tx - anchor_x
    dy = ty - anchor_y

    M = np.float32([[1, 0, dx], [0, 1, dy]])

    return cv2.warpAffine(
        image,
        M,
        (image.shape[1], image.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),
    )


def find_black_anchor(image, black_thresh=40, density_thresh=0.02):
    """
    Returns (x, y) of first black concentration from top-left

    :param image: Original image
    :param black_thresh: Optional. Determines what is black vs white when binary.
    :param density_thresh: Optional. Determines how much black is needed to qualify as starting point.
    """

    # Grayscale
    gray = colour.toGreyscale(image)

    # Binary: black = 1, white = 0
    _, binary = cv2.threshold(gray, black_thresh, 255, cv2.THRESH_BINARY_INV)

    h, w = binary.shape

    # Find top-most row with sufficient black pixels
    anchor_y = None
    for y in range(h):
        if np.count_nonzero(binary[y]) / w >= density_thresh:
            anchor_y = y
            break

    # Find left-most column with sufficient black pixels
    anchor_x = None
    for x in range(w):
        if np.count_nonzero(binary[:, x]) / h >= density_thresh:
            anchor_x = x
            break

    if anchor_x is None or anchor_y is None:
        raise ValueError("No black pixel concentration found")

    return anchor_x, anchor_y
