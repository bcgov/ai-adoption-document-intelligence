from tools import noise, skew, orientation, size, colour, positioning
import cv2

# Create a server instance

# MCP currently just to test functions in isolation easily


def denoise():
    NOISE_THRESHOLD = 50  # Arbitrary value. Noisy test valued at >100
    image = cv2.imread("test-images/form1_noisy.jpg", cv2.IMREAD_UNCHANGED)
    (mean_noise, _) = noise.calculate_noise_metrics(image)
    if mean_noise > NOISE_THRESHOLD:
        image = noise.denoise(image)
    cv2.imwrite("result-images/form1_noisy.jpg", image)


def deskew():
    # rotational skew
    images = ["form1_skew_right", "form1_skew_left"]
    for image_name in images:
        image = cv2.imread(f"test-images/{image_name}.jpg", cv2.IMREAD_UNCHANGED)
        (rotated_image, _) = skew.rotational_skew(image)
        cv2.imwrite(f"result-images/{image_name}.jpg", rotated_image)
    # and then perspective skew
    image_name = "form1_skew_perspective"
    image = cv2.imread(f"test-images/{image_name}.jpg", cv2.IMREAD_UNCHANGED)
    result = skew.perspective_skew(image)
    cv2.imwrite(f"result-images/{image_name}.jpg", result)


def rotate():
    images = ["form1_rotated90", "form1_rotated180"]
    for image_name in images:
        image = cv2.imread(f"test-images/{image_name}.jpg", cv2.IMREAD_UNCHANGED)
        anchor_image = cv2.imread(
            "test-images/monthly_report_anchor.png", cv2.IMREAD_UNCHANGED
        )
        # This is important. It must be the correct size to match the image.
        anchor_image = size.resize(anchor_image, target_width=110, target_height=110)
        desired_rotation = orientation.determine_rotation_angle(image, anchor_image)
        rotated_image = orientation.rotate(image, desired_rotation)
        cv2.imwrite(f"result-images/{image_name}.jpg", rotated_image)


def resize():
    image = cv2.imread("test-images/form1_big.jpg", cv2.IMREAD_UNCHANGED)
    anchor_image = cv2.imread(
        "test-images/monthly_report_anchor_correct_size.jpg", cv2.IMREAD_UNCHANGED
    )
    (resized, scale) = size.resize_to_anchor(image, anchor_image)
    cv2.imwrite(f"result-images/form1_big.jpg", resized)


def colours():
    image = cv2.imread("test-images/form1_big.jpg", cv2.IMREAD_UNCHANGED)
    grey = colour.toGreyscale(image)
    cv2.imwrite(f"result-images/form1_grey.jpg", grey)
    blackWhite = colour.toBlackWhite(image)
    cv2.imwrite(f"result-images/form1_black_white.jpg", blackWhite)


def position():
    image = cv2.imread("test-images/form1_big.jpg", cv2.IMREAD_UNCHANGED)
    # anchor_image = cv2.imread(
    #     "test-images/monthly_report_anchor3.png", cv2.IMREAD_UNCHANGED
    # )
    # anchor_image = size.resize(anchor_image, target_width=110, target_height=110)
    result = positioning.align_image_by_black_pixels(image, target_pos=(0, 0))
    cv2.imwrite(f"result-images/form1_positioned.jpg", result)
    # cv2.imwrite(f"result-images/debug.jpg", debug)


if __name__ == "__main__":
    position()
    colours()
    resize()
    rotate()
    deskew()
    denoise()
