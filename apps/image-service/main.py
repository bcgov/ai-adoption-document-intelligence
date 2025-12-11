from fastmcp import FastMCP
from tools import noise, skew, orientation, size
import cv2

# Create a server instance
mcp = FastMCP(name="image-service")

# Use MCP Inspector to test


@mcp.tool()
def denoise():
    NOISE_THRESHOLD = 50  # Arbitrary value. Noisy test valued at >100
    image = cv2.imread("test-images/form1_noisy.jpg", cv2.IMREAD_UNCHANGED)
    (mean_noise, _) = noise.calculate_noise_metrics(image)
    if mean_noise > NOISE_THRESHOLD:
        image = noise.denoise(image)
    cv2.imwrite("result-images/form1_noisy.jpg", image)


@mcp.tool()
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


@mcp.tool()
def rotate():
    images = ["form1_rotated90", "form1_rotated180"]
    angles = []
    for image_name in images:
        image = cv2.imread(f"test-images/{image_name}.jpg", cv2.IMREAD_UNCHANGED)
        anchor_image = cv2.imread(
            "test-images/monthly_report_anchor3.png", cv2.IMREAD_UNCHANGED
        )
        anchor_image = size.resize(anchor_image, target_width=110, target_height=110)
        desired_rotation = orientation.determine_rotation_angle(image, anchor_image)
        rotated_image = orientation.rotate(image, desired_rotation)
        cv2.imwrite(f"result-images/{image_name}.jpg", rotated_image)
        angles.append(desired_rotation)
    return angles


if __name__ == "__main__":
    mcp.run()  # Default: uses STDIO transport
