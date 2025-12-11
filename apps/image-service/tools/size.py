import cv2


def scale(image, percent):
    width = int(image.shape[1] * percent / 100)
    height = int(image.shape[0] * percent / 100)
    dim = (width, height)
    return cv2.resize(image, dim, interpolation=cv2.INTER_AREA)


def resize(image, target_width, target_height):
    """
    Resize the image to a specific width and height.

    Parameters:
        image (numpy.ndarray): The original image.
        target_width (int): Desired width.
        target_height (int): Desired height.

    Returns:
        numpy.ndarray: Resized image.
    """
    resized_image = cv2.resize(
        image, (target_width, target_height), interpolation=cv2.INTER_AREA
    )
    return resized_image
