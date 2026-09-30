import Image from "next/image";

export function BrandLogo() {
  return (
    <Image
      src="/zyora-labs.jpg"
      alt="Zyora Labs"
      width={384}
      height={147}
      unoptimized
      className="h-auto w-40 object-contain"
    />
  );
}