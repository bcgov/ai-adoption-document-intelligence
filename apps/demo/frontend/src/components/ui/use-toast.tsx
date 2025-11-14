// Simple toast implementation
export function useToast() {
  return {
    toast: (options: { title: string; description?: string }) => {
      // Simple browser alert for now - can be enhanced with a proper toast library
      console.log("Toast:", options.title, options.description)
      alert(`${options.title}${options.description ? `: ${options.description}` : ""}`)
    },
  }
}


