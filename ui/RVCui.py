import customtkinter as ctk
import math
from PIL import Image, ImageDraw, ImageFilter

class RVCui(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("RVC GUI")
        self.geometry("800x680")
        
        ctk.set_appearance_mode("dark")

        self.label = ctk.CTkLabel(self, text="RVC Clone App", font=("Times New Roman", 24))
        self.label.pack(pady=15)

        banner_pil = self.generate_cyber_banner(600, 140)
        self.cyber_img = ctk.CTkImage(light_image=banner_pil, dark_image=banner_pil, size=(600, 140))
        
        self.image_label = ctk.CTkLabel(self, image=self.cyber_img, text="")
        self.image_label.pack(pady=10)
        
        self.textbox = ctk.CTkTextbox(self, width=600, height=180, font=("Times New Roman", 14))
        self.textbox.pack(pady=15)
        
        self.initial_text = (
            "Welcome to the RVC Clone App!\n\n"
            "This application allows you to perform real-time conversion of audio files using the RVC model.\n\n"
            "To get started, click the 'Start Realtime Conversion' button below."
        )
        self.update_textbox(self.initial_text)

        self.start_button = ctk.CTkButton(
            self, 
            text="Start Realtime Conversion", 
            command=self.on_start_click, 
            fg_color="darkred", 
            hover_color="red", 
            text_color="white", 
            font=("Times New Roman", 18, "bold")
        )
        self.start_button.pack(pady=10)

        self.reset_button = ctk.CTkButton(
            self, 
            text="Reset App", 
            command=self.reset_app, 
            fg_color="darkblue", 
            hover_color="blue", 
            text_color="white", 
            font=("Times New Roman", 18, "bold")
        )
        self.reset_button.pack(pady=10)

    def update_textbox(self, text: str):
        self.textbox.configure(state="normal")
        self.textbox.delete("1.0", "end")
        self.textbox.insert("1.0", text)
        
        self.textbox._textbox.tag_add("center", "1.0", "end")
        self.textbox._textbox.tag_config("center", justify="center")

    def on_start_click(self):
        self.label.configure(text="Converting...", font=("Times New Roman", 24, "bold"))
        self.textbox.configure(state="disabled")
        self.start_button.configure(fg_color="green", hover_color="lightgreen", text_color="white")   
    
    def reset_app(self):
        self.label.configure(text="RVC Clone App", font=("Times New Roman", 24))
        self.update_textbox(self.initial_text)
        self.start_button.configure(fg_color="darkred", hover_color="red", text_color="white")

    def generate_cyber_banner(self, width: int, height: int) -> Image.Image:
        img = Image.new("RGB", (width, height), color="#0D0E12")
        draw = ImageDraw.Draw(img)
        
        center_x, center_y = width // 2, height // 2

        bars = 50
        bar_w = 6
        spacing = 4
        start_x = center_x - ((bars * (bar_w + spacing)) // 2)
        
        for i in range(bars):
            h = int(10 + 45 * abs(math.sin(i * 0.25) * math.cos(i * 0.15)))
            
            x0 = start_x + i * (bar_w + spacing)
            y0 = center_y - h
            x1 = x0 + bar_w
            y1 = center_y + h
            
            r = int(56 + (200 - 56) * (i / bars))
            g = int(189 - 100 * (i / bars))
            b = 248
            draw.rounded_rectangle([x0, y0, x1, y1], radius=3, fill=(r, g, b))

        img = img.filter(ImageFilter.GaussianBlur(0.6))
        return img

if __name__ == "__main__":
    app = RVCui()
    app.mainloop()