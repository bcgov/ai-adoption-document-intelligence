import cv2
import numpy as np
import math
import sys
import traceback


def rotational_skew(image):
    """
    Attempts to deskew an image to its nearest 90 degree angle.

    This means if the image is already nearly rotated 90 degrees, it will
    adjust it to that orientation, not necessarily upright.

    :param image: The image loaded through cv2 library.
    :returns Tuple[rotated_image, original_angle]: original_angle is based of nearest 90 degree point.
    """
    # Convert to greyscale and invert colour values
    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    grey = cv2.bitwise_not(grey)
    # Force all pixels to either black or white
    thresh = cv2.threshold(grey, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    # Identify all pixels that have a value >0 (i.e. white pixels)
    coords = np.column_stack(np.where(thresh > 0))
    # Use those to locate a bounding box
    # The last element in the returned array is the angle of the box
    angle = cv2.minAreaRect(coords)[-1]

    # Depending on the original skew direction, it must be adjusted
    # This is because it measures the angle from nearest 90 degrees, increasing counterclockwise.
    # e.g. Upright is 0 degrees, so 4 degrees is 4 degrees counterclockwise.
    # But a document turned 90 degrees clockwise is also reported as 0,
    # so something skewed 5 degrees clockwise from top will actually return 85 degrees.
    original_angle = angle
    if angle > 45:
        angle = -(angle - 90)

    # otherwise, just take the inverse of the angle to make
    # it positive
    else:
        angle = -angle
    # rotate the image to deskew it
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)

    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated_image = cv2.warpAffine(
        image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated_image, original_angle


#################
# AREA BELOW USED FOR PERSPECTIVE SKEW
################
def detect_lines(img, vertical=True, min_length=50):
    """
    Detects non-straight lines in an image. Used for perspective correction.

    :param img: The original image.
    :param vertical: Boolean. True = looks for vertical lines. False = Horizontal
    :param min_length: Excludes any lines under this length in pixels
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)

    # Identify all of the vertical lines in the image
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=80, minLineLength=min_length, maxLineGap=10
    )
    filtered = []
    if lines is None:
        return filtered

    # We only keep the ones with a substantial (20%) lean
    for x1, y1, x2, y2 in lines[:, 0]:
        dx = x2 - x1
        dy = y2 - y1
        if vertical and abs(dx) < abs(dy) * 0.2:
            filtered.append((x1, y1, x2, y2))
        elif not vertical and abs(dy) < abs(dx) * 0.2:
            filtered.append((x1, y1, x2, y2))
    return filtered


# Used to find corners on an image, usually a table
def line_intersection(line1, line2):
    """
    Locates the crossing point between two line vectors.
    This aids in finding corners in the original image.

    :param line1: One line
    :param line2: Another line to compare with
    """
    x1, y1, x2, y2 = line1
    x3, y3, x4, y4 = line2
    A = np.array([[x2 - x1, x3 - x4], [y2 - y1, y3 - y4]])
    b = np.array([x3 - x1, y3 - y1])
    try:
        t = np.linalg.solve(A, b)
        xi = x1 + t[0] * (x2 - x1)
        yi = y1 + t[0] * (y2 - y1)
        return [xi, yi]
    except np.linalg.LinAlgError:
        return None


def perspective_skew(image):
    """
    Attempts to fix perspective skew in an image.
    Uses lines visible in an image to establish the existing skew and anchor points.
    Calculates the difference and applies it to the original image.

    :param img: The original image.
    """
    vlines = detect_lines(image, vertical=True)
    hlines = detect_lines(image, vertical=False)

    if len(vlines) < 2 or len(hlines) < 2:
        print("Not enough lines detected")
        return image

    # pick extremes
    left_line = min(vlines, key=lambda l: (l[0] + l[2]) / 2)
    right_line = max(vlines, key=lambda l: (l[0] + l[2]) / 2)
    top_line = min(hlines, key=lambda l: (l[1] + l[3]) / 2)
    bottom_line = max(hlines, key=lambda l: (l[1] + l[3]) / 2)

    # compute corners
    tl = line_intersection(left_line, top_line)
    tr = line_intersection(right_line, top_line)
    bl = line_intersection(left_line, bottom_line)
    br = line_intersection(right_line, bottom_line)

    if None in [tl, tr, bl, br]:
        print("Could not compute all corners")
        return image

    # Points to where this initial bounding box is (including skew)
    src_pts = np.array([tl, tr, br, bl], dtype=np.float32)

    # target rectangle size
    width = int(
        max(
            np.linalg.norm(np.array(tr) - np.array(tl)),
            np.linalg.norm(np.array(br) - np.array(bl)),
        )
    )
    height = int(
        max(
            np.linalg.norm(np.array(bl) - np.array(tl)),
            np.linalg.norm(np.array(br) - np.array(tr)),
        )
    )

    # These destination points are used to create the transformation instructions
    dst_pts = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )

    H = cv2.getPerspectiveTransform(src_pts, dst_pts)

    # Warp entire original image and avoid cropping
    h, w = image.shape[:2]
    # corners of original image
    orig_corners = np.array(
        [[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32
    ).reshape(-1, 1, 2)
    warped_corners = cv2.perspectiveTransform(orig_corners, H)

    # compute bounding box
    min_xy = np.floor(warped_corners.min(axis=0)).astype(int)[0]
    max_xy = np.ceil(warped_corners.max(axis=0)).astype(int)[0]
    out_w = max_xy[0] - min_xy[0]
    out_h = max_xy[1] - min_xy[1]

    # translation to move top-left to (0,0)
    # otherwise it was cropping the top and left sides
    translation = np.array(
        [[1, 0, -min_xy[0]], [0, 1, -min_xy[1]], [0, 0, 1]], dtype=np.float32
    )
    H_shifted = translation @ H

    corrected = cv2.warpPerspective(
        image,
        H_shifted,
        (out_w, out_h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255),  # fill with white
    )
    return corrected
