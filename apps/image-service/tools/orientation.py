import cv2


def rotate(image, degrees):
    """
    Rotates an image a set number of degrees. Designed to be used for large amounts in 90 degree turns, but will technically rotate an image
    any number of degrees. The image is not cropped but instead expanded if it does not fit the original size.

    :param image: Image loaded through cv2.
    :param degrees: Rotation angle. Positive = counter-clockwise rotation.
    """
    # Step 1: basic geometry
    h, w = image.shape[:2]
    center = (w / 2.0, h / 2.0)

    # Step 2: get rotation matrix (float32)
    M = cv2.getRotationMatrix2D(center, degrees, 1.0)

    # Step 3: compute new bounding box size
    abs_cos = abs(M[0, 0])
    abs_sin = abs(M[0, 1])

    new_w = int(h * abs_sin + w * abs_cos)
    new_h = int(h * abs_cos + w * abs_sin)

    # Step 4: adjust the matrix to re-center the rotated image
    M[0, 2] += (new_w - w) / 2.0
    M[1, 2] += (new_h - h) / 2.0

    # Step 5: perform rotation using expanded canvas
    rotated_image = cv2.warpAffine(image, M, (new_w, new_h))
    return rotated_image


def determine_rotation_angle(image, anchor) -> int:
    # Precompute template
    anchor = cv2.cvtColor(anchor, cv2.COLOR_BGR2GRAY)

    best_angle = 0
    best_score = -1

    for angle in [0, 90, 180, 270]:
        # rotate image without cropping
        rotated_image = rotate(image, angle)
        gray = cv2.cvtColor(rotated_image, cv2.COLOR_BGR2GRAY)

        result = cv2.matchTemplate(gray, anchor, cv2.TM_CCOEFF_NORMED)
        score = result.max()

        if score > best_score:
            best_score = score
            best_angle = angle

    # This seems counter to what the rotate function expects.
    return best_angle
