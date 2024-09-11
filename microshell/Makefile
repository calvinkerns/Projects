# Compiler and flags
CC = gcc
CFLAGS = -Wall -Wextra -g

# Object files
OBJS = ush.o expand.o builtin.o strmode.o
SCR = script

# Main target
ush: $(OBJS)
	$(CC) $(CFLAGS) -o ush $(OBJS)

# Rule to build .o files from .c files
%.o: %.c
	$(CC) $(CFLAGS) -c $<

# Run target
run: ush
	./ush

# Clean up build artifacts
clean:
	rm -f *.o ush

# Script target
script:
	script -O $(SCR)

# Generate cover PDF
cover: cover.tex
	pdflatex cover.tex

# Convert source files to PostScript
a2ps: ush.c
	a2ps ush.c -o ush.ps -1
	a2ps expand.c -o expand.ps -1
	a2ps builtin.c -o builtin.ps -1
	a2ps defn.h -o defn.ps -1
	a2ps Makefile -o Makefile.ps -1
	a2ps myTestingScript -o myTestingScript.ps -1
	a2ps gradingScriptA4 -o gradingScriptA4.ps -1
	
# Convert PostScript files to PDF
htmltopdf:
	ps2pdf myTestingScript.ps myTestingScript.pdf && \
	ps2pdf gradingScriptA4.ps gradingScriptA4.pdf && \
	ps2pdf ush.ps ush.pdf && \
	ps2pdf expand.ps expand.pdf && \
	ps2pdf defn.ps defn.pdf && \
	ps2pdf Makefile.ps Makefile.pdf && \
	ps2pdf builtin.ps builtin.pdf

# Generate all PDFs and clean up
generate: cover a2ps htmltopdf
	pdfunite cover.pdf ush.pdf expand.pdf builtin.pdf defn.pdf Makefile.pdf myTestingScript.pdf gradingScriptA4.pdf output.pdf && \
	make clean

# Dependency list for object files
ush.o: ush.c defn.h
expand.o: expand.c defn.h
builtin.o: builtin.c defn.h
strmode.o: strmode.c defn.h# Compiler and flags
CC = gcc
CFLAGS = -Wall -Wextra -g

