import cv2
import numpy as np


def bounding_box_skew(image):
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
